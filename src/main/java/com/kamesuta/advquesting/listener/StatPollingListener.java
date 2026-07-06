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
            int playerCount = Bukkit.getOnlinePlayers().size();
            if (playerCount > 0) {
                Bukkit.getLogger().info("[StatPolling] Polling stats for " + playerCount + " players");
            }
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
     * カスタム統計をポーリングして進捗を更新する。
     * Bukkit API で実際に利用可能な統計のみを使用する。
     */
    private void pollCustomStats(Player player, Map<String, Integer> playerStats) {
        // Bukkit API で利用可能なカスタム統計
        // Paper 1.21.11 の Statistic 列挙型に存在するもののみ
        Statistic[] customStats = {
            // 移動系
            Statistic.JUMP,
            Statistic.WALK_ONE_CM,
            Statistic.SPRINT_ONE_CM,
            Statistic.CROUCH_ONE_CM,  // スニークした距離
            Statistic.SWIM_ONE_CM,
            Statistic.FLY_ONE_CM,
            Statistic.FALL_ONE_CM,
            Statistic.CLIMB_ONE_CM,
            Statistic.WALK_ON_WATER_ONE_CM,
            Statistic.WALK_UNDER_WATER_ONE_CM,
            Statistic.SNEAK_TIME,
            // 時間系
            Statistic.PLAY_ONE_MINUTE,
            Statistic.TOTAL_WORLD_TIME,
            Statistic.TIME_SINCE_DEATH,
            Statistic.TIME_SINCE_REST,
            // インタラクション系
            Statistic.TALKED_TO_VILLAGER,
            Statistic.TRADED_WITH_VILLAGER,
            Statistic.BELL_RING,
            Statistic.TARGET_HIT,
            Statistic.RAID_TRIGGER,
            Statistic.RAID_WIN,
            Statistic.SLEEP_IN_BED,
            Statistic.CHEST_OPENED,  // チェストを開いた回数
            Statistic.ENDERCHEST_OPENED,
            Statistic.SHULKER_BOX_OPENED,
            Statistic.OPEN_BARREL,
            Statistic.TRAPPED_CHEST_TRIGGERED,
            // 戦闘・活動系
            Statistic.ANIMALS_BRED,
            Statistic.FISH_CAUGHT,
            Statistic.MOB_KILLS,
            Statistic.PLAYER_KILLS,
            Statistic.DEATHS,
            Statistic.DAMAGE_DEALT,
            Statistic.DAMAGE_TAKEN,
            Statistic.DAMAGE_ABSORBED,
            Statistic.DAMAGE_RESISTED,
            Statistic.DAMAGE_BLOCKED_BY_SHIELD,
            // その他
            Statistic.LEAVE_GAME,
        };

        for (Statistic stat : customStats) {
            try {
                int newValue = player.getStatistic(stat);
                String statId = NamespacedId.from(stat).toString();

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
