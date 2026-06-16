package com.kamesuta.advquesting.api;

import com.google.gson.JsonObject;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.NotFoundResponse;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
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

        // GET /api/player/location — ログイン中プレイヤーの現在座標・ディメンションを返す
        app.get("/api/player/location", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);

            CompletableFuture<Map<String, Object>> future = new CompletableFuture<>();
            Bukkit.getScheduler().runTask(plugin, () -> {
                try {
                    Player player = Bukkit.getPlayer(UUID.fromString(session.playerUuid()));
                    if (player == null) {
                        future.completeExceptionally(new NotFoundResponse("プレイヤーがオンラインではありません"));
                        return;
                    }
                    org.bukkit.Location loc = player.getLocation();
                    // ディメンション名を "overworld" / "nether" / "end" に正規化する
                    String key = player.getWorld().getKey().getKey(); // "overworld", "the_nether", "the_end"
                    String dimension = switch (key) {
                        case "the_nether" -> "nether";
                        case "the_end"    -> "end";
                        default           -> "overworld";
                    };
                    future.complete(Map.of(
                        "x", (int) loc.getX(),
                        "y", (int) loc.getY(),
                        "z", (int) loc.getZ(),
                        "dimension", dimension
                    ));
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
                    result.put("itemId", item.getType().getKey().toString());
                    result.put("count", item.getAmount());

                    // componentsのみ保存 (id/countは別フィールドで管理するため冗長性を排除)
                    JsonObject json = Bukkit.getUnsafe().serializeItemAsJson(item);
                    JsonObject components = json.has("components") ? json.getAsJsonObject("components") : null;
                    if (components != null && !components.isEmpty()) {
                        result.put("nbt", components.toString());
                    }

                    // 表示名 (カスタム名 or バニラ名) をプレーンテキストで返す
                    String displayName = PlainTextComponentSerializer.plainText()
                            .serialize(item.effectiveName());
                    result.put("displayName", displayName);

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

    /**
     * components JSON文字列からItemStackを復元する。
     * nbtJson は {"minecraft:enchantments":...} 形式のcomponentsのみ。
     * itemType と count を使ってフルJSONを再構築してから deserialize する。
     */
    public static ItemStack deserializeItem(String nbtJson, String itemType, int count) {
        try {
            JsonObject components = com.google.gson.JsonParser.parseString(nbtJson).getAsJsonObject();
            JsonObject full = new JsonObject();
            full.addProperty("id", itemType);
            full.addProperty("count", count);
            full.add("components", components);
            full.addProperty("DataVersion", Bukkit.getUnsafe().getDataVersion());
            return Bukkit.getUnsafe().deserializeItemFromJson(full);
        } catch (Exception e) {
            return null;
        }
    }
}
