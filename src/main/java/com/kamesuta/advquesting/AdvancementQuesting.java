package com.kamesuta.advquesting;

import com.kamesuta.advquesting.api.AiRoutes;
import com.kamesuta.advquesting.api.AuthRoutes;
import com.kamesuta.advquesting.api.CommentRoutes;
import com.kamesuta.advquesting.api.ConfigRoutes;
import com.kamesuta.advquesting.api.NotificationRoutes;
import com.kamesuta.advquesting.api.PlayerRoutes;
import com.kamesuta.advquesting.api.PlayerProfileRoutes;
import com.kamesuta.advquesting.api.ProposalRoutes;
import com.kamesuta.advquesting.api.ProgressRoutes;
import com.kamesuta.advquesting.api.QuestRoutes;
import com.kamesuta.advquesting.api.DashboardRoutes;
import com.kamesuta.advquesting.api.RankingRoutes;
import com.kamesuta.advquesting.api.StatsRoutes;
import com.kamesuta.advquesting.command.QuestCommand;
import com.kamesuta.advquesting.command.QuestEditCommand;
import com.kamesuta.advquesting.data.AdvancementSyncManager;
import com.kamesuta.advquesting.data.CommentManager;
import com.kamesuta.advquesting.data.ProgressManager;
import com.kamesuta.advquesting.data.QuestManager;
import com.kamesuta.advquesting.data.RepeatScheduler;
import com.kamesuta.advquesting.db.AuthCodeDao;
import com.kamesuta.advquesting.db.CompletionDao;
import com.kamesuta.advquesting.db.DatabaseManager;
import com.kamesuta.advquesting.db.ProgressDao;
import com.kamesuta.advquesting.db.ProposalDao;
import com.kamesuta.advquesting.db.DashboardConfigDao;
import com.kamesuta.advquesting.db.RewardClaimDao;
import com.kamesuta.advquesting.db.StatsDao;
import com.kamesuta.advquesting.db.SessionDao;
import com.kamesuta.advquesting.listener.AdvancementListener;
import com.kamesuta.advquesting.listener.ItemProgressListener;
import com.kamesuta.advquesting.listener.LocationProgressListener;
import com.kamesuta.advquesting.listener.PlayerJoinListener;
import com.kamesuta.advquesting.listener.ScoreboardListener;
import com.kamesuta.advquesting.listener.StatProgressListener;
import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;
import org.bukkit.plugin.java.JavaPlugin;

import java.sql.SQLException;
import java.util.Map;
import java.util.Objects;

public final class AdvancementQuesting extends JavaPlugin {

    private Javalin app;
    private DatabaseManager db;
    private ScoreboardListener scoreboardListener;
    private RepeatScheduler repeatScheduler;
    private NotificationRoutes notificationRoutes;
    private AdvancementSyncManager advancementSyncManager;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        // データベース初期化
        try {
            db = new DatabaseManager(this);
        } catch (SQLException e) {
            getLogger().severe("データベースの初期化に失敗しました: " + e.getMessage());
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        SessionDao sessionDao = new SessionDao(db);
        AuthCodeDao authCodeDao = new AuthCodeDao(db, sessionDao);
        ProgressDao progressDao = new ProgressDao(db);
        CompletionDao completionDao = new CompletionDao(db);
        RewardClaimDao rewardClaimDao = new RewardClaimDao(db);
        ProposalDao proposalDao = new ProposalDao(db);
        QuestManager questManager = new QuestManager(getDataFolder());
        // 既存クエストJSONの短縮形ID ("stone") を完全形式 ("minecraft:stone") へ移行する (冪等)
        int idMigrated = questManager.migrateLegacyIds();
        if (idMigrated > 0) {
            getLogger().info("クエストIDを完全形式へ移行: " + idMigrated + " ファイル");
        }
        CommentManager commentManager = new CommentManager(getDataFolder());
        ProgressManager progressManager = new ProgressManager(this, questManager, progressDao, completionDao, rewardClaimDao);
        advancementSyncManager = new AdvancementSyncManager(this, questManager, progressDao);
        advancementSyncManager.loadAll();
        progressManager.setAdvancementSyncManager(advancementSyncManager);

        // 既存の完了済み進捗をクリアログへ初回移行する (冪等)。
        // 機能リリース前にクリア済みのプレイヤーをランキングに載せる。
        try {
            int migrated = completionDao.migrateFromProgress(uuid -> {
                try {
                    return getServer().getOfflinePlayer(java.util.UUID.fromString(uuid)).getName();
                } catch (Exception e) {
                    return null;
                }
            });
            if (migrated > 0) getLogger().info("ランキング: 既存クリア記録 " + migrated + " 件を移行しました");
        } catch (Exception e) {
            getLogger().warning("ランキングのクリア記録移行に失敗: " + e.getMessage());
        }

        // 既存の「クリア済み&受取済み」進捗を報酬受取ログへ初回移行する (冪等)。
        try {
            int migrated = rewardClaimDao.migrateFromProgress(
                questId -> {
                    var q = questManager.findById(questId);
                    if (q == null) return null;
                    return new RewardClaimDao.QuestRewards(q.title,
                        com.kamesuta.advquesting.data.RewardInterpreter.toLogEntries(q.rewards));
                },
                uuid -> {
                    try {
                        return getServer().getOfflinePlayer(java.util.UUID.fromString(uuid)).getName();
                    } catch (Exception e) {
                        return null;
                    }
                });
            if (migrated > 0) getLogger().info("報酬: 既存受取記録 " + migrated + " 件を移行しました");
        } catch (Exception e) {
            getLogger().warning("報酬の受取記録移行に失敗: " + e.getMessage());
        }

        int port = getConfig().getInt("web-port", 8080);
        String webUrl = getConfig().getString("web-url", "http://localhost:" + port);

        // Javalin HTTP サーバー起動
        boolean hasWebUi = getClass().getResource("/dist/index.html") != null;
        app = Javalin.create(config -> {
            if (hasWebUi) {
                config.staticFiles.add("/dist", Location.CLASSPATH);
            }
            // CORS: 開発時の Vite dev server からのアクセスを許可
            config.bundledPlugins.enableCors(cors ->
                cors.addRule(rule -> rule.anyHost())
            );
        });

        // DB例外は集中ハンドラで500に変換する (各ルートのtry/catch重複を排除)
        app.exception(SQLException.class, (e, ctx) -> {
            getLogger().severe("DB error at " + ctx.method() + " " + ctx.path() + ": " + e);
            ctx.status(500).json(Map.of("error", "Database error"));
        });

        // API ルート登録
        notificationRoutes = new NotificationRoutes(sessionDao);
        progressManager.setNotificationRoutes(notificationRoutes);
        new AuthRoutes(sessionDao, authCodeDao).register(app);
        new ConfigRoutes(this).register(app);
        new QuestRoutes(questManager, sessionDao, this, advancementSyncManager).register(app);
        new AiRoutes(this, sessionDao).register(app);
        new CommentRoutes(commentManager, sessionDao).register(app);
        new ProgressRoutes(progressDao, progressManager, sessionDao).register(app);
        new RankingRoutes(completionDao, sessionDao).register(app);
        new PlayerProfileRoutes(completionDao, rewardClaimDao, questManager).register(app);
        new ProposalRoutes(proposalDao, questManager, sessionDao).register(app);
        StatsDao statsDao = new StatsDao(db);
        DashboardConfigDao dashboardConfigDao = new DashboardConfigDao(db);
        new StatsRoutes(statsDao, questManager).register(app);
        new DashboardRoutes(dashboardConfigDao, sessionDao).register(app);
        new PlayerRoutes(this, sessionDao).register(app);
        notificationRoutes.register(app);

        // SPA フォールバック: /api 以外の未知パスは index.html を返す
        app.error(404, ctx -> {
            if (!ctx.path().startsWith("/api")) {
                var stream = getClass().getResourceAsStream("/dist/index.html");
                if (stream != null) {
                    ctx.result(stream).contentType("text/html; charset=utf-8");
                }
            }
        });

        app.start(port);
        getLogger().info("Web UI を起動しました: " + webUrl);

        // イベントリスナー登録
        getServer().getPluginManager().registerEvents(new PlayerJoinListener(this, advancementSyncManager), this);
        getServer().getPluginManager().registerEvents(new AdvancementListener(progressManager), this);
        getServer().getPluginManager().registerEvents(new ItemProgressListener(progressManager), this);
        getServer().getPluginManager().registerEvents(new StatProgressListener(progressManager), this);
        getServer().getPluginManager().registerEvents(new LocationProgressListener(progressManager), this);
        scoreboardListener = new ScoreboardListener(progressManager);
        scoreboardListener.start(this);

        repeatScheduler = new RepeatScheduler(this, questManager, progressDao, notificationRoutes);
        repeatScheduler.start();

        // コマンド登録
        QuestCommand questCommand = new QuestCommand(authCodeDao, webUrl, progressDao, progressManager, questManager);
        Objects.requireNonNull(getCommand("quest")).setExecutor(questCommand);
        Objects.requireNonNull(getCommand("quest")).setTabCompleter(questCommand);

        QuestEditCommand questEditCommand = new QuestEditCommand(progressManager, questManager);
        Objects.requireNonNull(getCommand("quest_edit")).setExecutor(questEditCommand);
        Objects.requireNonNull(getCommand("quest_edit")).setTabCompleter(questEditCommand);
    }

    @Override
    public void onDisable() {
        if (advancementSyncManager != null) advancementSyncManager.unloadAll();
        if (repeatScheduler != null) repeatScheduler.stop();
        if (scoreboardListener != null) scoreboardListener.stop();
        // SSE クライアントを先に閉じてから Javalin を停止する。
        // keepAlive() 中のクライアントが Jetty 内に残ると ClassLoader が解放されない。
        if (notificationRoutes != null) notificationRoutes.closeAll();
        if (app != null) app.stop();
        if (db != null) db.close();
        // SQLite NativeDB は finalize() を持つため、明示的に close() しても
        // ファイナライザキューに残り ClassLoader が解放されない。
        // ここで GC + finalization を促してメモリリークを防ぐ。
        System.gc();
        System.runFinalization(); // NOSONAR: プラグインリロード時に限定した使用
    }
}
