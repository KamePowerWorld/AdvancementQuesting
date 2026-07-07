package com.kamesuta.advquesting.data;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** クエスト完了時の通知・演出・繰り返しリセット処理。 */
class CompletionNotifier {

    private final ProgressManager manager;

    CompletionNotifier(ProgressManager manager) {
        this.manager = manager;
    }

    /**
     * クエスト完了時の共通処理: pending_rewards インクリメント + 通知 + 繰り返しリセット。
     * upsertProgress で completed=true にした後に呼ぶ。
     */
    void notifyQuestComplete(String playerUuid, Quest quest) {
        try {
            manager.progressDao.incrementCompletedCount(playerUuid, quest.id);
        } catch (Exception e) {
            manager.log.warning("incrementCompletedCount error: " + e.getMessage());
        }

        try {
            manager.completionDao.insert(playerUuid, manager.rewardManager.playerUuidToName(playerUuid),
                quest.id, Instant.now().toString());
        } catch (Exception e) {
            manager.log.warning("completion log insert error: " + e.getMessage());
        }

        if (manager.notificationRoutes != null) {
            manager.notificationRoutes.sendQuestComplete(playerUuid, quest.id, quest.title,
                manager.rewardManager.playerUuidToName(playerUuid));
        }

        // 繰り返しタイプ処理
        Quest.RepeatConfig repeat = quest.repeat;
        if (repeat != null && "unlimited".equals(repeat.type)) {
            try {
                var rec = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
                List<Map<String, Object>> completedProgress = rec != null
                    ? ProgressManager.MAPPER.readValue(rec.progress(), ProgressManager.LIST_MAP_TYPE)
                    : new ArrayList<>();
                String newProgressJson = ProgressUpdater.buildResetProgressJson(quest, completedProgress);
                manager.progressDao.resetForRepeatWithProgress(playerUuid, quest.id, newProgressJson);
            } catch (Exception e) {
                manager.log.warning("resetForRepeat (unlimited) error: " + e.getMessage());
            }
        }
        // cooldown / schedule: RepeatScheduler が毎分チェックしてリセットする

        String playerName = manager.rewardManager.playerUuidToName(playerUuid);
        Component broadcastMsg = Component.text("🎉 ")
            .append(Component.text(playerName, NamedTextColor.YELLOW))
            .append(Component.text(" が "))
            .append(Component.text(quest.title, NamedTextColor.GOLD, TextDecoration.BOLD))
            .append(Component.text(" をクリアしました！"));
        Bukkit.getServer().broadcast(broadcastMsg);

        Player player = Bukkit.getPlayer(UUID.fromString(playerUuid));
        if (player == null) return;
        Bukkit.getScheduler().runTask(manager.plugin, () -> {
            Component hoverContent = Component.text(quest.title, NamedTextColor.GOLD, TextDecoration.BOLD);
            if (quest.description != null && !quest.description.isEmpty()) {
                hoverContent = hoverContent
                    .append(Component.newline())
                    .append(Component.text(quest.description, NamedTextColor.GRAY));
            }
            if (quest.conditions != null && !quest.conditions.isEmpty()) {
                hoverContent = hoverContent.append(Component.newline());
                for (Map<String, Object> cond : quest.conditions) {
                    String condTitle = cond.get("title") instanceof String t ? t : (String) cond.get("type");
                    if (condTitle != null) {
                        hoverContent = hoverContent
                            .append(Component.newline())
                            .append(Component.text("・" + condTitle, NamedTextColor.WHITE));
                    }
                }
            }

            Component claimMsg = Component.text("✨ クエスト完了: ", NamedTextColor.GOLD)
                .append(Component.text(quest.title, NamedTextColor.WHITE, TextDecoration.BOLD))
                .append(Component.newline())
                .append(Component.text("報酬を受け取るには ", NamedTextColor.GRAY))
                .append(Component.text("/quest claim " + quest.id, NamedTextColor.GREEN)
                    .clickEvent(ClickEvent.runCommand("/quest claim " + quest.id))
                    .hoverEvent(HoverEvent.showText(hoverContent)))
                .append(Component.text(" を実行", NamedTextColor.GRAY));
            player.sendMessage(claimMsg);

            player.playSound(player.getLocation(), Sound.UI_TOAST_CHALLENGE_COMPLETE, 1f, 1f);
            Location loc = player.getLocation().add(0, 1, 0);
            player.getWorld().spawnParticle(Particle.TOTEM_OF_UNDYING, loc, 60, 0.5, 0.7, 0.5, 0.1);
            player.getWorld().spawnParticle(Particle.FIREWORK, loc, 30, 0.3, 0.5, 0.3, 0.05);
        });
    }
}
