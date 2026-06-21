package com.kamesuta.advquesting.api;

import io.javalin.Javalin;
import io.javalin.http.NotFoundResponse;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.nio.file.Files;
import java.util.Map;

public class ConfigRoutes {

    private final JavaPlugin plugin;

    public ConfigRoutes(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    public void register(Javalin app) {
        app.get("/api/config", ctx -> {
            String title = plugin.getConfig().getString("site-title", "AdvancementQuesting");
            ctx.json(Map.of("title", title));
        });

        // GET /favicon.png — plugins/AdvancementQuesting/favicon.png を返す
        app.get("/favicon.png", ctx -> {
            File faviconFile = new File(plugin.getDataFolder(), "favicon.png");
            if (!faviconFile.exists()) throw new NotFoundResponse("favicon.png not found");
            byte[] bytes = Files.readAllBytes(faviconFile.toPath());
            ctx.contentType("image/png");
            ctx.result(bytes);
        });
    }
}
