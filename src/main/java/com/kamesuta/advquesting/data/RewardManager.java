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
            RewardInterpreter.ParsedReward p = RewardInterpreter.parse(reward);
            if (p == null) continue;
            if ("item".equals(p.type())) {
                try {
                    ItemStack itemStack = null;
                    if (p.nbt() != null) {
                        itemStack = PlayerRoutes.deserializeItem(p.nbt(), p.itemType(), p.count());
                    }
                    if (itemStack == null) {
                        Material mat = resolveMaterial(p.itemType());
                        if (mat != null) itemStack = new ItemStack(mat, p.count());
                    }
                    if (itemStack != null) {
                        player.getWorld().dropItem(player.getLocation(), itemStack);
                    }
                } catch (Exception e) {
                    log.warning("Failed to give item reward: " + p.itemType() + " - " + e.getMessage());
                }
            } else if ("experience".equals(p.type())) {
                player.giveExp(p.amount());
            } else if ("command".equals(p.type())) {
                if (p.command() != null) {
                    Bukkit.dispatchCommand(Bukkit.getConsoleSender(),
                        p.command().replace("{player}", player.getName()));
                }
            } else if ("point".equals(p.type())) {
                String template = manager.plugin.getConfig().getString(
                    "point-command", "scoreboard players add {player} point {amount}");
                String cmd = template
                    .replace("{player}", player.getName())
                    .replace("{amount}", String.valueOf(p.amount()));
                Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd);
            }
        }
        player.sendMessage("§a報酬を受け取りました！");
    }
}
