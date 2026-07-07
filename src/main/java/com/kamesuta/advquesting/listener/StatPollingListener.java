package com.kamesuta.advquesting.listener;

import com.kamesuta.advquesting.data.ProgressManager;
import com.kamesuta.advquesting.util.NamespacedId;
import org.bukkit.Bukkit;
import org.bukkit.Statistic;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 統計を定期的にポーリングして進捗を更新する。
 * PlayerStatisticIncrementEvent が発火しない高頻度統計をカバーする。
 */
public class StatPollingListener {

    private final ProgressManager progressManager;
    private final Map<UUID, Map<String, Integer>> lastStats = new ConcurrentHashMap<>();
    private BukkitTask pollingTask;

    public StatPollingListener(ProgressManager progressManager) {
        this.progressManager = progressManager;
    }

    /**
     * ポーリングを開始する。
     * 5秒ごと（100ティック）に全プレイヤーの統計をチェックする。
     */
    public void start(JavaPlugin plugin) {
        pollingTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            for (Player player : Bukkit.getOnlinePlayers()) {
                UUID uuid = player.getUniqueId();
                lastStats.putIfAbsent(uuid, new ConcurrentHashMap<>());
                pollCustomStats(player, lastStats.get(uuid));
            }
        }, 0L, 100L); // 100ティック = 5秒
        Bukkit.getLogger().info("[StatPolling] Polling started (interval: 5 seconds)");
    }

    /**
     * ポーリングを停止する。
     */
    public void stop() {
        if (pollingTask != null) {
            pollingTask.cancel();
        }
        lastStats.clear();
    }

    /**
     * カスタム統計 (UNTYPED) を全件ポーリングして進捗を更新する。
     */
    private void pollCustomStats(Player player, Map<String, Integer> playerStats) {
        for (Statistic stat : Statistic.values()) {
            if (stat.getType() != Statistic.Type.UNTYPED) continue;
            NamespacedId customId = NamespacedId.fromCustomStatistic(stat);
            if (customId == null) continue;
            try {
                int newValue = player.getStatistic(stat);
                String statId = customId.toString();

                Integer oldValue = playerStats.get(statId);

                if (oldValue == null) {
                    // 初回は現在値を保存
                    playerStats.put(statId, newValue);
                } else if (newValue > oldValue) {
                    // 値が増加した場合のみ進捗を更新
                    Bukkit.getLogger().info("[StatPolling] " + player.getName() + ": " + statId + " changed from " + oldValue + " to " + newValue);
                    progressManager.onStat(player.getUniqueId().toString(), "minecraft:custom", statId, newValue);
                    playerStats.put(statId, newValue);
                }
            } catch (Exception e) {
                // 統計取得に失敗した場合はスキップ（例：存在しない統計）
                Bukkit.getLogger().warning("[StatPolling] Failed to get statistic: " + stat + " - " + e.getMessage());
            }
        }
    }
}
