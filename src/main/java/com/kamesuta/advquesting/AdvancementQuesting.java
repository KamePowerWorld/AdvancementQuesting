package com.kamesuta.advquesting;

import com.kamesuta.advquesting.api.AuthRoutes;
import com.kamesuta.advquesting.api.NotificationRoutes;
import com.kamesuta.advquesting.api.ProposalRoutes;
import com.kamesuta.advquesting.api.ProgressRoutes;
import com.kamesuta.advquesting.api.QuestRoutes;
import com.kamesuta.advquesting.command.QuestCommand;
import com.kamesuta.advquesting.data.ProgressManager;
import com.kamesuta.advquesting.data.QuestManager;
import com.kamesuta.advquesting.db.AuthCodeDao;
import com.kamesuta.advquesting.db.DatabaseManager;
import com.kamesuta.advquesting.db.ProgressDao;
import com.kamesuta.advquesting.db.ProposalDao;
import com.kamesuta.advquesting.db.SessionDao;
import com.kamesuta.advquesting.listener.AdvancementListener;
import com.kamesuta.advquesting.listener.ItemProgressListener;
import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;
import org.bukkit.plugin.java.JavaPlugin;

import java.sql.SQLException;
import java.util.Objects;

public final class AdvancementQuesting extends JavaPlugin {

    private Javalin app;
    private DatabaseManager db;

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
        ProposalDao proposalDao = new ProposalDao(db);
        QuestManager questManager = new QuestManager(getDataFolder());
        ProgressManager progressManager = new ProgressManager(this, questManager, progressDao);

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

        // API ルート登録
        NotificationRoutes notificationRoutes = new NotificationRoutes(sessionDao);
        progressManager.setNotificationRoutes(notificationRoutes);
        new AuthRoutes(sessionDao, authCodeDao).register(app);
        new QuestRoutes(questManager, sessionDao).register(app);
        new ProgressRoutes(progressDao, progressManager, sessionDao).register(app);
        new ProposalRoutes(proposalDao, questManager, sessionDao).register(app);
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
        getServer().getPluginManager().registerEvents(new AdvancementListener(progressManager), this);
        getServer().getPluginManager().registerEvents(new ItemProgressListener(progressManager), this);

        // コマンド登録
        QuestCommand questCommand = new QuestCommand(authCodeDao, webUrl, progressDao, progressManager, questManager);
        Objects.requireNonNull(getCommand("quest")).setExecutor(questCommand);
        Objects.requireNonNull(getCommand("quest")).setTabCompleter(questCommand);
    }

    @Override
    public void onDisable() {
        if (app != null) app.stop();
        if (db != null) db.close();
    }
}
