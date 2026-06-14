package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kamesuta.advquesting.api.NotificationRoutes;
import com.kamesuta.advquesting.api.PlayerRoutes;
import com.kamesuta.advquesting.db.ProgressDao;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

/**
 * プレイヤーの進捗チェック・更新・報酬付与を行う。
 * Javalin スレッドから呼ばれることがあるので Bukkit API はスケジューラ経由で呼ぶ。
 */
public class ProgressManager {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    private final Plugin plugin;
    private final QuestManager questManager;
    private final ProgressDao progressDao;
    private final Logger log;
    private NotificationRoutes notificationRoutes;

    public ProgressManager(Plugin plugin, QuestManager questManager, ProgressDao progressDao) {
        this.plugin = plugin;
        this.questManager = questManager;
        this.progressDao = progressDao;
        this.log = plugin.getLogger();
    }

    public void setNotificationRoutes(NotificationRoutes notificationRoutes) {
        this.notificationRoutes = notificationRoutes;
    }

    /**
     * Advancement 達成時に呼ぶ。
     * 一致する条件を持つクエストの進捗を更新し、全条件達成ならクエスト完了とする。
     */
    public void onAdvancement(String playerUuid, String advancementKey) {
        try {
            for (Quest quest : questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean matched = quest.conditions.stream().anyMatch(c ->
                    "advancement".equals(c.get("type")) && advancementKey.equals(c.get("advancementId"))
                );
                if (matched) {
                    markConditionComplete(playerUuid, quest, "advancement", advancementKey);
                }
            }
        } catch (Exception e) {
            log.warning("onAdvancement error: " + e.getMessage());
        }
    }

    /**
     * アイテム獲得時に呼ぶ。
     * itemType が一致する item 条件の count を消費分だけ加算する。
     */
    public void onItemPickup(String playerUuid, String itemType, int amount) {
        try {
            for (Quest quest : questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean hasMatch = quest.conditions.stream().anyMatch(c ->
                    "item".equals(c.get("type")) && itemType.equals(c.get("itemType"))
                );
                if (hasMatch) {
                    updateItemProgress(playerUuid, quest, itemType, amount);
                }
            }
        } catch (Exception e) {
            log.warning("onItemPickup error: " + e.getMessage());
        }
    }

    /**
     * 報酬を受け取る。
     * @return true: 受け取り成功、false: 未完了または受け取り済み
     */
    public boolean claimReward(String playerUuid, int questId) throws SQLException {
        boolean claimed = progressDao.markRewardClaimed(playerUuid, questId);
        if (!claimed) return false;

        Quest quest = questManager.findById(questId);
        if (quest == null || quest.rewards == null) return true;

        Player player = Bukkit.getPlayer(java.util.UUID.fromString(playerUuid));
        if (player == null) return true; // オフラインなら次回ログイン時に渡す（将来対応）

        List<Map<String, Object>> rewards = quest.rewards;
        Bukkit.getScheduler().runTask(plugin, () -> giveRewards(player, rewards));
        return true;
    }

    /**
     * クエストの完了状態を管理コマンドで強制設定する。
     * 完了にした場合は達成演出付きで通知、未完了に戻した場合は進捗の再取得のみ通知する。
     * @return クエストが存在すれば true、存在しなければ false
     */
    public boolean setQuestCompleted(String playerUuid, int questId, boolean completed) throws SQLException {
        Quest quest = questManager.findById(questId);
        if (quest == null) return false;

        String progressJson;
        try {
            if (completed && quest.conditions != null && !quest.conditions.isEmpty()) {
                // 全条件を完了状態にするJSONを生成
                List<Map<String, Object>> allDone = new ArrayList<>();
                for (Map<String, Object> cond : quest.conditions) {
                    String condId = (String) cond.get("id");
                    if (condId == null) continue;
                    if ("item".equals(cond.get("type"))) {
                        int required = ((Number) cond.getOrDefault("count", 1)).intValue();
                        allDone.add(Map.of("conditionId", condId, "current", required, "required", required, "completed", true));
                    } else {
                        allDone.add(Map.of("conditionId", condId, "completed", true));
                    }
                }
                progressJson = MAPPER.writeValueAsString(allDone);
            } else {
                progressJson = "[]";
            }
        } catch (Exception e) {
            progressJson = "[]";
        }

        progressDao.setCompleted(playerUuid, questId, completed, progressJson);

        if (completed) {
            // 達成演出付きで通知（チャット・サウンド・パーティクル・SSE）
            notifyQuestComplete(playerUuid, quest);
        } else if (notificationRoutes != null) {
            // 未完了に戻した: ブラウザに進捗再取得を促す（演出なし）
            notificationRoutes.sendProgressUpdate(playerUuid, questId, false);
        }
        return true;
    }

    // ---- private helpers ----

    private void markConditionComplete(String playerUuid, Quest quest, String condType, String condValue)
            throws Exception {
        ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

        boolean changed = false;
        for (Map<String, Object> cond : quest.conditions) {
            if (!condType.equals(cond.get("type"))) continue;
            if (!condValue.equals(cond.get("advancementId"))) continue;
            String condId = (String) cond.get("id");
            // 既に完了済みならスキップ
            boolean alreadyDone = progress.stream()
                .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (!alreadyDone) {
                progress.removeIf(p -> condId.equals(p.get("conditionId")));
                progress.add(Map.of("conditionId", condId, "completed", true));
                changed = true;
            }
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
        String completedAt = allDone ? Instant.now().toString() : null;
        progressDao.upsertProgress(playerUuid, quest.id, MAPPER.writeValueAsString(progress), allDone, completedAt);

        if (allDone) {
            notifyQuestComplete(playerUuid, quest);
        }
    }

    private void updateItemProgress(String playerUuid, Quest quest, String itemType, int addAmount)
            throws Exception {
        ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

        boolean changed = false;
        for (Map<String, Object> cond : quest.conditions) {
            if (!"item".equals(cond.get("type"))) continue;
            if (!itemType.equals(cond.get("itemType"))) continue;
            String condId = (String) cond.get("id");
            int required = ((Number) cond.getOrDefault("count", 1)).intValue();

            // 現在の収集数
            Map<String, Object> existing = progress.stream()
                .filter(p -> condId.equals(p.get("conditionId")))
                .findFirst().orElse(null);
            int current = existing == null ? 0 : ((Number) existing.getOrDefault("current", 0)).intValue();
            boolean wasCompleted = existing != null && Boolean.TRUE.equals(existing.get("completed"));
            if (wasCompleted) continue;

            int newCount = Math.min(current + addAmount, required);
            boolean nowDone = newCount >= required;
            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", condId, "current", newCount, "required", required, "completed", nowDone));
            changed = true;
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
        String completedAt = allDone ? Instant.now().toString() : null;
        progressDao.upsertProgress(playerUuid, quest.id, MAPPER.writeValueAsString(progress), allDone, completedAt);

        if (allDone) {
            notifyQuestComplete(playerUuid, quest);
        }
    }

    private boolean isAllConditionsMet(Quest quest, List<Map<String, Object>> progress) {
        if (quest.conditions == null || quest.conditions.isEmpty()) return false;
        for (Map<String, Object> cond : quest.conditions) {
            // checkmark 型は手動確認なので自動達成しない
            if ("checkmark".equals(cond.get("type"))) continue;
            String condId = (String) cond.get("id");
            boolean done = progress.stream()
                .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (!done) return false;
        }
        return true;
    }

    private void notifyQuestComplete(String playerUuid, Quest quest) {
        // SSE でブラウザに通知 (Javalin スレッドから呼べる)
        if (notificationRoutes != null) {
            notificationRoutes.sendQuestComplete(playerUuid, quest.id, quest.title,
                playerUuidToName(playerUuid));
        }

        Player player = Bukkit.getPlayer(java.util.UUID.fromString(playerUuid));
        if (player == null) return;
        Bukkit.getScheduler().runTask(plugin, () -> {
            // チャットメッセージ
            player.sendMessage(net.kyori.adventure.text.Component.text(
                "§6✨ クエスト完了: §f§l" + quest.title + "\n§7報酬を受け取るには §a/quest claim " + quest.id + " §7を実行"
            ));
            // サウンド
            player.playSound(player.getLocation(), Sound.UI_TOAST_CHALLENGE_COMPLETE, 1f, 1f);
            // パーティクル (プレイヤー周囲に花火)
            Location loc = player.getLocation().add(0, 1, 0);
            player.getWorld().spawnParticle(Particle.TOTEM_OF_UNDYING, loc, 60, 0.5, 0.7, 0.5, 0.1);
            player.getWorld().spawnParticle(Particle.FIREWORK, loc, 30, 0.3, 0.5, 0.3, 0.05);
        });
    }

    private String playerUuidToName(String playerUuid) {
        Player online = Bukkit.getPlayer(java.util.UUID.fromString(playerUuid));
        if (online != null) return online.getName();
        return playerUuid;
    }

    private void giveRewards(Player player, List<Map<String, Object>> rewards) {
        for (Map<String, Object> reward : rewards) {
            String type = (String) reward.get("type");
            if ("item".equals(type)) {
                String itemType = (String) reward.getOrDefault("itemType", reward.get("itemId"));
                int count = ((Number) reward.getOrDefault("count", 1)).intValue();
                String nbtJson = reward.get("nbt") instanceof String s ? s : null;
                try {
                    org.bukkit.inventory.ItemStack itemStack = null;
                    if (nbtJson != null) {
                        itemStack = PlayerRoutes.deserializeItem(nbtJson, itemType, count);
                    }
                    if (itemStack == null) {
                        String matName = itemType.contains(":")
                            ? itemType.substring(itemType.indexOf(':') + 1).toUpperCase()
                            : itemType.toUpperCase();
                        org.bukkit.Material mat = org.bukkit.Material.matchMaterial(matName);
                        if (mat != null) itemStack = new org.bukkit.inventory.ItemStack(mat, count);
                    }
                    if (itemStack != null) player.getInventory().addItem(itemStack);
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
            }
        }
        player.sendMessage("§a報酬を受け取りました！");
    }
}
