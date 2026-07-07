package com.kamesuta.advquesting.listener;

import com.kamesuta.advquesting.data.ProgressManager;
import com.kamesuta.advquesting.util.NamespacedId;
import org.bukkit.Material;
import org.bukkit.Statistic;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.player.PlayerStatisticIncrementEvent;

/**
 * 統計 (Statistic) の変化を監視して stat 条件の進捗を更新する。
 *
 * PlayerStatisticIncrementEvent で mined / crafted / used / broken /
 * picked_up / dropped / killed / killed_by / custom の全カテゴリをカバーする。
 * ただしこのイベントが発火しない統計もあるため、主要な採掘・討伐は
 * BlockBreakEvent / EntityDeathEvent でも補完する。
 */
public class StatProgressListener implements Listener {

    private final ProgressManager progressManager;

    public StatProgressListener(ProgressManager progressManager) {
        this.progressManager = progressManager;
    }

    /**
     * 統計値が増加したとき。
     * Bukkit の Statistic 列挙型を "minecraft:*" 形式の statType に変換して通知する。
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onStatistic(PlayerStatisticIncrementEvent event) {
        Player player = event.getPlayer();
        Statistic stat = event.getStatistic();

        // Statistic の種類に応じて statType と statId を決定する
        String statType;
        String statId;

        switch (stat.getType()) {
            case BLOCK -> {
                // アイテム/ブロック系の統計カテゴリを Statistic 名から判定
                statType = NamespacedId.toStatType(stat);
                if (statType == null) return;
                Material material = event.getMaterial();
                if (material == null) return;
                statId = NamespacedId.from(material).toString();
            }
            case ITEM -> {
                statType = NamespacedId.toStatType(stat);
                if (statType == null) return;
                Material material = event.getMaterial();
                if (material == null) return;
                statId = NamespacedId.from(material).toString();
            }
            case ENTITY -> {
                statType = NamespacedId.toStatType(stat);
                if (statType == null) return;
                EntityType entityType = event.getEntityType();
                if (entityType == null) return;
                statId = NamespacedId.from(entityType).toString();
            }
            case UNTYPED -> {
                // カスタム統計 (JUMP, WALK_ONE_CM, etc.)
                NamespacedId customId = NamespacedId.fromCustomStatistic(stat);
                if (customId == null) return;
                statType = "minecraft:custom";
                statId = customId.toString();
            }
            default -> { return; }
        }

        int delta = event.getNewValue() - event.getPreviousValue();
        if (delta <= 0) return;

        progressManager.onStat(player.getUniqueId().toString(), statType, statId, event.getNewValue());
    }
}
