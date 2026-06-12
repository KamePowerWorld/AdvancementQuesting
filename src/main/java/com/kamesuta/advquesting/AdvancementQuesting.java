package com.kamesuta.advquesting;

import com.kamesuta.advquesting.api.AuthRoutes;
import com.kamesuta.advquesting.api.QuestRoutes;
import com.kamesuta.advquesting.command.QuestCommand;
import com.kamesuta.advquesting.data.QuestManager;
import com.kamesuta.advquesting.db.AuthCodeDao;
import com.kamesuta.advquesting.db.DatabaseManager;
import com.kamesuta.advquesting.db.SessionDao;
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
        QuestManager questManager = new QuestManager(getDataFolder());

        int port = getConfig().getInt("web-port", 8080);
        String webUrl = getConfig().getString("web-url", "http://localhost:" + port);

        // Javalin HTTP サーバー起動
        app = Javalin.create(config -> {
            config.staticFiles.add("/dist", Location.CLASSPATH);
            // CORS: 開発時の Vite dev server からのアクセスを許可
            config.bundledPlugins.enableCors(cors ->
                cors.addRule(rule -> rule.anyHost())
            );
        });

        // API ルート登録
        new AuthRoutes(sessionDao, authCodeDao).register(app);
        new QuestRoutes(questManager, sessionDao).register(app);

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

        // コマンド登録
        QuestCommand questCommand = new QuestCommand(authCodeDao, webUrl);
        Objects.requireNonNull(getCommand("quest")).setExecutor(questCommand);
        Objects.requireNonNull(getCommand("quest")).setTabCompleter(questCommand);
    }

    @Override
    public void onDisable() {
        if (app != null) app.stop();
        if (db != null) db.close();
    }
}
