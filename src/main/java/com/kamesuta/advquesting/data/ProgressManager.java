package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kamesuta.advquesting.api.NotificationRoutes;
import com.kamesuta.advquesting.db.CompletionDao;
import com.kamesuta.advquesting.db.ProgressDao;
import com.kamesuta.advquesting.db.RewardClaimDao;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.logging.Logger;

/**
 * プレイヤーの進捗チェック・更新・報酬付与を行うファサード。
 * 各責務は ProgressEventHandler / ProgressUpdater / CompletionNotifier / RewardManager に委譲する。
 * Javalin スレッドから呼ばれることがあるので Bukkit API はスケジューラ経由で呼ぶ。
 */
public class ProgressManager {

    static final ObjectMapper MAPPER = new ObjectMapper();
    static final TypeReference<List<Map<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    // パッケージプライベート: ヘルパークラスから直接参照する
    final JavaPlugin plugin;
    final QuestManager questManager;
    final ProgressDao progressDao;
    final CompletionDao completionDao;
    final RewardClaimDao rewardClaimDao;
    final Logger log;
    NotificationRoutes notificationRoutes;
    AdvancementSyncManager advancementSyncManager;

    // ヘルパーインスタンス
    final RewardManager rewardManager;
    final CompletionNotifier completionNotifier;
    final ProgressUpdater progressUpdater;
    private final ProgressEventHandler eventHandler;

    public ProgressManager(JavaPlugin plugin, QuestManager questManager, ProgressDao progressDao,
                           CompletionDao completionDao, RewardClaimDao rewardClaimDao) {
        this.plugin = plugin;
        this.questManager = questManager;
        this.progressDao = progressDao;
        this.completionDao = completionDao;
        this.rewardClaimDao = rewardClaimDao;
        this.log = plugin.getLogger();

        this.rewardManager = new RewardManager(this);
        this.completionNotifier = new CompletionNotifier(this);
        this.progressUpdater = new ProgressUpdater(this);
        this.eventHandler = new ProgressEventHandler(this);
    }

    public void setNotificationRoutes(NotificationRoutes notificationRoutes) {
        this.notificationRoutes = notificationRoutes;
    }

    public void setAdvancementSyncManager(AdvancementSyncManager advancementSyncManager) {
        this.advancementSyncManager = advancementSyncManager;
    }

    // ---- イベント委譲 ----

    public void onAdvancement(String playerUuid, String advancementKey) {
        eventHandler.onAdvancement(playerUuid, advancementKey);
    }

    public void onItemPickup(String playerUuid, String itemType, int inventoryCount) {
        eventHandler.onItemPickup(playerUuid, itemType, inventoryCount);
    }

    public void onStat(String playerUuid, String statType, String statId, int currentValue) {
        eventHandler.onStat(playerUuid, statType, statId, currentValue);
    }

    public void onScoreChange(String playerUuid, String objective, int score) {
        eventHandler.onScoreChange(playerUuid, objective, score);
    }

    public void onPlayerMove(String playerUuid, int x, int y, int z, String dimension) {
        eventHandler.onPlayerMove(playerUuid, x, y, z, dimension);
    }

    // ---- 公開 API ----

    /**
     * チェックマーク条件をWebUIから手動で完了する。
     * @return true: 完了に成功、false: 条件が存在しないか既に完了済み
     */
    public boolean completeCheckmarkCondition(String playerUuid, int questId, String conditionId) throws SQLException {
        Quest quest = questManager.findById(questId);
        if (quest == null || quest.conditions == null) return false;

        boolean isCheckmark = quest.conditions.stream().anyMatch(c ->
            "checkmark".equals(c.get("type")) && conditionId.equals(c.get("id"))
        );
        if (!isCheckmark) return false;

        try {
            ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, questId);
            List<Map<String, Object>> progress = record == null
                ? new ArrayList<>()
                : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

            boolean alreadyDone = progress.stream()
                .anyMatch(p -> conditionId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (alreadyDone) return false;

            progress.removeIf(p -> conditionId.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", conditionId, "completed", true));

            boolean allDone = progressUpdater.isAllConditionsMet(quest, progress);
            if (!allDone) allDone = progressUpdater.isAllConditionsMetIncludingCheckmarks(quest, progress);
            String completedAt = allDone ? Instant.now().toString() : null;
            String progressJson = MAPPER.writeValueAsString(progress);
            progressDao.upsertProgress(playerUuid, questId, progressJson, allDone, completedAt);
            if (advancementSyncManager != null) {
                advancementSyncManager.syncPlayerQuestProgress(playerUuid, quest, progressJson);
            }
            if (allDone) {
                completionNotifier.notifyQuestComplete(playerUuid, quest);
            } else if (notificationRoutes != null) {
                notificationRoutes.sendProgressUpdate(playerUuid, questId, false);
            }
            return true;
        } catch (Exception e) {
            log.warning("completeCheckmarkCondition error: " + e.getMessage());
            throw new SQLException(e);
        }
    }

    /**
     * 報酬を受け取る（まとめて全 pending_rewards 分）。
     * @return 受け取った回数 (0 = 未完了または受取済み)
     */
    public int claimReward(String playerUuid, int questId) throws SQLException {
        Quest quest = questManager.findById(questId);
        if (quest == null) return 0;

        ProgressDao.ProgressRecord rec = progressDao.findByPlayerAndQuest(playerUuid, questId);
        if (rec == null) return 0;

        boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
        int claimed = 0;
        if (isRepeat) {
            while (progressDao.claimOnePendingReward(playerUuid, questId)) claimed++;
        } else {
            boolean ok = progressDao.markRewardClaimed(playerUuid, questId);
            claimed = ok ? 1 : 0;
        }
        if (claimed == 0) return 0;

        try {
            for (int i = 0; i < claimed; i++) {
                rewardClaimDao.insertQuestRewards(playerUuid, rewardManager.playerUuidToName(playerUuid),
                    quest.id, quest.title, quest.rewards, Instant.now().toString(), "claim");
            }
        } catch (Exception e) {
            log.warning("reward claim log insert error: " + e.getMessage());
        }

        Player player = Bukkit.getPlayer(UUID.fromString(playerUuid));
        if (player == null) return claimed;

        List<Map<String, Object>> rewards = quest.rewards;
        final int times = claimed;
        Bukkit.getScheduler().runTask(plugin, () -> {
            for (int i = 0; i < times; i++) rewardManager.giveRewards(player, rewards);
        });
        return claimed;
    }

    /** 納品結果: conditionId → 納品数 */
    public record DeliveryResult(Map<String, Integer> delivered, Map<String, Integer> failed) {}

    /**
     * WebUI から「納品する」を押したときに呼ぶ。
     * delivery 条件ごとにプレイヤーのインベントリからアイテムを消費し、進捗を更新する。
     */
    public DeliveryResult deliverItems(String playerUuid, int questId) throws Exception {
        Quest quest = questManager.findById(questId);
        if (quest == null || quest.conditions == null) return new DeliveryResult(Map.of(), Map.of());
        if (!progressUpdater.arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return new DeliveryResult(Map.of(), Map.of());

        List<Map<String, Object>> deliveryConds = quest.conditions.stream()
            .filter(c -> "delivery".equals(c.get("type")))
            .toList();
        if (deliveryConds.isEmpty()) return new DeliveryResult(Map.of(), Map.of());

        Player player = Bukkit.getPlayer(UUID.fromString(playerUuid));
        if (player == null) return new DeliveryResult(Map.of(), Map.of());

        ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, questId);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

        Map<String, Integer> delivered = new HashMap<>();
        Map<String, Integer> failed = new HashMap<>();

        CompletableFuture<Void> future = new CompletableFuture<>();
        Bukkit.getScheduler().runTask(plugin, () -> {
            try {
                for (Map<String, Object> cond : deliveryConds) {
                    String condId = (String) cond.get("id");
                    if (condId == null) continue;
                    boolean alreadyDone = progress.stream()
                        .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
                    if (alreadyDone) continue;

                    String itemType = (String) cond.getOrDefault("itemType", "stone");
                    int required = ((Number) cond.getOrDefault("count", 1)).intValue();
                    Map<String, Object> existing = progress.stream()
                        .filter(p -> condId.equals(p.get("conditionId")))
                        .findFirst().orElse(null);
                    int alreadyDelivered = existing == null ? 0 : ((Number) existing.getOrDefault("current", 0)).intValue();
                    int stillNeeded = required - alreadyDelivered;
                    if (stillNeeded <= 0) continue;

                    org.bukkit.Material mat = RewardManager.resolveMaterial(itemType);
                    if (mat == null) { failed.put(condId, stillNeeded); continue; }

                    int haveCount = 0;
                    for (org.bukkit.inventory.ItemStack slot : player.getInventory().getContents()) {
                        if (slot != null && slot.getType() == mat) haveCount += slot.getAmount();
                    }
                    if (haveCount == 0) { failed.put(condId, stillNeeded); continue; }

                    int toConsume = Math.min(haveCount, stillNeeded);
                    player.getInventory().removeItem(new org.bukkit.inventory.ItemStack(mat, toConsume));
                    player.updateInventory();

                    int newTotal = alreadyDelivered + toConsume;
                    boolean nowDone = newTotal >= required;
                    progress.removeIf(p -> condId.equals(p.get("conditionId")));
                    progress.add(Map.of("conditionId", condId, "current", newTotal, "required", required, "completed", nowDone));
                    delivered.put(condId, toConsume);
                }
                future.complete(null);
            } catch (Exception e) {
                future.completeExceptionally(e);
            }
        });

        try {
            future.get(5, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warning("deliverItems error: " + e.getMessage());
            return new DeliveryResult(Map.of(), Map.of());
        }

        if (delivered.isEmpty()) return new DeliveryResult(delivered, failed);

        boolean allDone = progressUpdater.isAllConditionsMetIncludingCheckmarks(quest, progress);
        String completedAt = allDone ? Instant.now().toString() : null;
        String progressJson;
        try {
            progressJson = MAPPER.writeValueAsString(progress);
            progressDao.upsertProgress(playerUuid, questId, progressJson, allDone, completedAt);
        } catch (Exception e) {
            log.warning("deliverItems upsert error: " + e.getMessage());
            return new DeliveryResult(delivered, failed);
        }
        if (advancementSyncManager != null) {
            advancementSyncManager.syncPlayerQuestProgress(playerUuid, quest, progressJson);
        }
        if (allDone) {
            completionNotifier.notifyQuestComplete(playerUuid, quest);
        } else if (notificationRoutes != null) {
            notificationRoutes.sendProgressUpdate(playerUuid, questId, false);
        }
        return new DeliveryResult(delivered, failed);
    }

    /**
     * クエストの完了状態を管理コマンドで強制設定する。
     * @return クエストが存在すれば true、存在しなければ false
     */
    public boolean setQuestCompleted(String playerUuid, int questId, boolean completed) throws SQLException {
        Quest quest = questManager.findById(questId);
        if (quest == null) return false;

        String progressJson;
        try {
            if (completed && quest.conditions != null && !quest.conditions.isEmpty()) {
                List<Map<String, Object>> allDone = new ArrayList<>();
                for (Map<String, Object> cond : quest.conditions) {
                    String condId = (String) cond.get("id");
                    if (condId == null) continue;
                    allDone.add(Map.of("conditionId", condId, "completed", true));
                }
                progressJson = MAPPER.writeValueAsString(allDone);
            } else {
                progressJson = "[]";
            }
        } catch (Exception e) {
            progressJson = "[]";
        }

        progressDao.setCompleted(playerUuid, questId, completed, progressJson);
        if (advancementSyncManager != null) {
            advancementSyncManager.syncPlayerQuestProgress(playerUuid, quest, progressJson);
        }
        if (completed) {
            completionNotifier.notifyQuestComplete(playerUuid, quest);
        } else if (notificationRoutes != null) {
            notificationRoutes.sendProgressUpdate(playerUuid, questId, false);
        }
        return true;
    }
}
