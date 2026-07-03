package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.db.ProgressDao;

import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 条件別の進捗更新ロジック。純粋評価は {@link ConditionEvaluator} へ委譲する。 */
class ProgressUpdater {

    private final ProgressManager manager;

    ProgressUpdater(ProgressManager manager) {
        this.manager = manager;
    }

    // ---- 前提クエスト確認 ----

    boolean arePrerequisitesMet(UUID playerUuid, Quest quest) {
        if (quest.prerequisites == null || quest.prerequisites.isEmpty()) return true;
        for (int prereqId : quest.prerequisites) {
            try {
                ProgressDao.ProgressRecord rec = manager.progressDao.findByPlayerAndQuest(playerUuid.toString(), prereqId);
                if (rec == null || !rec.completed()) return false;
            } catch (SQLException e) {
                manager.log.warning("arePrerequisitesMet error: " + e.getMessage());
                return false;
            }
        }
        return true;
    }

    // ---- 条件達成判定（ProgressManager から呼ばれる委譲メソッド） ----

    boolean isAllConditionsMet(Quest quest, List<Map<String, Object>> progress) {
        return ConditionEvaluator.isAllConditionsMet(quest, progress);
    }

    boolean isAllConditionsMetIncludingCheckmarks(Quest quest, List<Map<String, Object>> progress) {
        return ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, progress);
    }

    /**
     * 繰り返しリセット用の新しい進捗JSONを生成する。
     * CompletionNotifier / RepeatScheduler から呼ばれる。
     */
    static String buildResetProgressJson(Quest quest, List<Map<String, Object>> completedProgress) throws Exception {
        List<Map<String, Object>> list = ConditionEvaluator.buildResetProgressList(quest, completedProgress);
        return ProgressManager.MAPPER.writeValueAsString(list);
    }

    // ---- 共通 persist ヘルパー ----

    /**
     * 変更があった場合に進捗を永続化し、アドバンスメント同期・通知を行う。
     *
     * @param playerUuid        プレイヤーUUID文字列
     * @param quest             クエスト定義
     * @param progress          更新後の進捗リスト
     * @param changed           条件の変更フラグ
     * @param checkmarkFallback true の場合、isAllConditionsMet が false でも
     *                          isAllConditionsMetIncludingCheckmarks を追加チェックする
     *                          （location 更新のみ使用）
     */
    private void persistIfChanged(
            String playerUuid,
            Quest quest,
            List<Map<String, Object>> progress,
            boolean changed,
            boolean checkmarkFallback) throws Exception {
        if (!changed) return;
        boolean allDone = ConditionEvaluator.isAllConditionsMet(quest, progress);
        if (!allDone && checkmarkFallback) {
            allDone = ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, progress);
        }
        String completedAt = allDone ? Instant.now().toString() : null;
        String progressJson = ProgressManager.MAPPER.writeValueAsString(progress);
        manager.progressDao.upsertProgress(playerUuid, quest.id, progressJson, allDone, completedAt);
        if (manager.advancementSyncManager != null) {
            manager.advancementSyncManager.syncPlayerQuestProgress(playerUuid, quest, progressJson);
        }
        if (allDone) {
            manager.completionNotifier.notifyQuestComplete(playerUuid, quest);
        } else if (manager.notificationRoutes != null) {
            manager.notificationRoutes.sendProgressUpdate(playerUuid, quest.id, false);
        }
    }

    // ---- 各条件タイプの進捗更新 ----

    void markConditionComplete(String playerUuid, Quest quest, String condType, String condValue)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
                ? new ArrayList<>()
                : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        boolean changed = ConditionEvaluator.applyAdvancement(quest.conditions, progress, condType, condValue);
        persistIfChanged(playerUuid, quest, progress, changed, false);
    }

    void updateItemProgress(String playerUuid, Quest quest, String itemType, int inventoryCount)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
                ? new ArrayList<>()
                : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        boolean changed = ConditionEvaluator.applyItem(quest.conditions, progress, itemType, inventoryCount);
        persistIfChanged(playerUuid, quest, progress, changed, false);
    }

    void updateStatProgress(String playerUuid, Quest quest, String statType, String statId, int currentValue)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
                ? new ArrayList<>()
                : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
        boolean changed = ConditionEvaluator.applyStat(quest.conditions, progress, statType, statId, currentValue, isRepeat);
        persistIfChanged(playerUuid, quest, progress, changed, false);
    }

    void updateScoreboardProgress(String playerUuid, Quest quest, String objective, int score)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
                ? new ArrayList<>()
                : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
        boolean changed = ConditionEvaluator.applyScoreboard(quest.conditions, progress, objective, score, isRepeat);
        persistIfChanged(playerUuid, quest, progress, changed, false);
    }

    void updateLocationProgress(String playerUuid, Quest quest, int px, int py, int pz, String dimension)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
                ? new ArrayList<>()
                : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        boolean changed = ConditionEvaluator.applyLocation(quest.conditions, progress, px, py, pz, dimension);
        persistIfChanged(playerUuid, quest, progress, changed, true);
    }
}
