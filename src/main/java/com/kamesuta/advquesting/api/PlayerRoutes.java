package com.kamesuta.advquesting.api;

import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.NotFoundResponse;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.Plugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

public class PlayerRoutes {

    private final Plugin plugin;
    private final SessionDao sessionDao;

    public PlayerRoutes(Plugin plugin, SessionDao sessionDao) {
        this.plugin = plugin;
        this.sessionDao = sessionDao;
    }

    public void register(Javalin app) {

        // GET /api/player/held-item — ログイン中プレイヤーの手持ちアイテムを返す
        app.get("/api/player/held-item", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);

            CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
            Bukkit.getScheduler().runTask(plugin, () -> {
                try {
                    Player player = Bukkit.getPlayer(UUID.fromString(session.playerUuid()));
                    if (player == null) {
                        future.completeExceptionally(new NotFoundResponse("プレイヤーがオンラインではありません"));
                        return;
                    }
                    ItemStack item = player.getInventory().getItemInMainHand();
                    if (item.getType().isAir()) {
                        future.completeExceptionally(new NotFoundResponse("手持ちアイテムがありません"));
                        return;
                    }

                    Map<String, Object> result = new HashMap<>();
                    // minecraft:diamond_sword 形式
                    String itemId = item.getType().getKey().toString();
                    result.put("itemId", itemId);
                    result.put("count", item.getAmount());

                    ItemMeta meta = item.getItemMeta();
                    if (meta != null) {
                        // カスタム表示名
                        if (meta.hasDisplayName()) {
                            result.put("displayName", meta.getDisplayName());
                        }
                        // NBT (シリアライズ文字列)
                        String nbt = item.getItemMeta().getAsString();
                        if (nbt != null && !nbt.isEmpty() && !nbt.equals("{}")) {
                            result.put("nbt", nbt);
                        }
                    }
                    future.complete(result);
                } catch (Exception e) {
                    future.completeExceptionally(e);
                }
            });

            try {
                ctx.json(future.get());
            } catch (java.util.concurrent.ExecutionException e) {
                if (e.getCause() instanceof NotFoundResponse nf) throw nf;
                throw new RuntimeException(e.getCause());
            }
        });
    }
}
