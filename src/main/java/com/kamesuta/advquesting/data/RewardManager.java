package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.api.PlayerRoutes;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;

/** 報酬付与とプレイヤー名解決。 */
class RewardManager {

    private final ProgressManager manager;

    RewardManager(ProgressManager manager) {
        this.manager = manager;
    }

    /** itemType ("minecraft:diamond" / "diamond") から Material を解決する。見つからなければ null。 */
    static Material resolveMaterial(String itemType) {
        return Material.matchMaterial(McIds.stripNamespace(itemType).toUpperCase());
    }

    String playerUuidToName(String playerUuid) {
        UUID uuid = UUID.fromString(playerUuid);
        Player online = Bukkit.getPlayer(uuid);
        if (online != null) return online.getName();
        String offlineName = Bukkit.getOfflinePlayer(uuid).getName();
        return offlineName != null ? offlineName : playerUuid;
    }

    void giveRewards(Player player, List<Map<String, Object>> rewards) {
        Logger log = manager.log;
        for (Map<String, Object> reward : rewards) {
            String type = (String) reward.get("type");
            if ("item".equals(type)) {
                String itemType = (String) reward.getOrDefault("itemType", reward.get("itemId"));
                int count = ((Number) reward.getOrDefault("count", 1)).intValue();
                String nbtJson = reward.get("nbt") instanceof String s ? s : null;
                try {
                    ItemStack itemStack = null;
                    if (nbtJson != null) {
                        itemStack = PlayerRoutes.deserializeItem(nbtJson, itemType, count);
                    }
                    if (itemStack == null) {
                        Material mat = resolveMaterial(itemType);
                        if (mat != null) itemStack = new ItemStack(mat, count);
                    }
                    if (itemStack != null) {
                        player.getWorld().dropItem(player.getLocation(), itemStack);
                    }
                } catch (Exception e) {
                    log.warning("Failed to give item reward: " + itemType + " - " + e.getMessage());
                }
            } else if ("experience".equals(type)) {
                int amount = ((Number) reward.getOrDefault("amount", 0)).intValue();
                player.giveExp(amount);
            } else if ("command".equals(type)) {
                String cmd = (String) reward.get("command");
                if (cmd != null) {
                    Bukkit.dispatchCommand(Bukkit.getConsoleSender(),
                        cmd.replace("{player}", player.getName()));
                }
            } else if ("point".equals(type)) {
                int amount = ((Number) reward.getOrDefault("amount", 0)).intValue();
                String template = manager.plugin.getConfig().getString(
                    "point-command", "scoreboard players add {player} point {amount}");
                String cmd = template
                    .replace("{player}", player.getName())
                    .replace("{amount}", String.valueOf(amount));
                Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd);
            }
        }
        player.sendMessage("§a報酬を受け取りました！");
    }
}
