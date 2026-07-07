package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.db.ProgressDao;
import org.bukkit.Bukkit;

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
        return arePrerequisitesMet(playerUuid, quest, manager.progressDao);
    }

    private boolean arePrerequisitesMet(UUID playerUuid, Quest quest, ProgressDao dao) {
        if (quest.prerequisites == null || quest.prerequisites.isEmpty()) return true;
        for (int prereqId : quest.prerequisites) {
            try {
                ProgressDao.ProgressRecord rec = dao.findByPlayerAndQuest(playerUuid.toString(), prereqId);
                if (rec == null || !rec.completed()) return false;
            } catch (SQLException e) {
                manager.log.warning("arePrerequisitesMet error: " + e.getMessage());
                return false;
            }
        }
        return true;
    }

    // ---- 条件達成判定（ProgressManager から呼ばれる委譲メソッド） ----

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
     * 呼び出しスレッド上でDB書き込みまで同期実行する ({@link #markConditionComplete} 専用、
     * 常にBukkitメインスレッドから呼ばれる低頻度パスのみで使う)。
     *
     * @param playerUuid        プレイヤーUUID文字列
     * @param quest             クエスト定義
     * @param progress          更新後の進捗リスト
     * @param changed           条件の変更フラグ
     */
    private void persistIfChanged(
            String playerUuid,
            Quest quest,
            List<Map<String, Object>> progress,
            boolean changed) throws Exception {
        if (!changed) return;
        boolean allDone = ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, progress);
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

    /**
     * {@link #persistIfChanged} の非同期版。DB書き込み ({@code upsertProgress}) と、それに続く
     * 完了時のDB処理 ({@code CompletionNotifier.applyCompletionDb} の incrementCompletedCount /
     * resetForRepeatWithProgress) は {@code manager.dbExecutor} スレッド上で {@code manager.asyncProgressDao}
     * を使い、間に一切スレッドを挟まず連続実行する。
     * <p>
     * ここを分割してはいけない: resetForRepeatWithProgress 等は直前の upsertProgress が
     * 既にコミット済みであることを前提に read-modify-write するため、途中でメインスレッドへの
     * hopを挟んで遅延させると、直後に来る次のイベントの読み取りとレースして更新が失われる
     * (繰り返しクエストの2回目クリアが検出されない、等)。
     * <p>
     * {@code advancementSyncManager.syncPlayerQuestProgress} は内部で自分でメインスレッドへ
     * ディスパッチするため呼び出しスレッドを問わない。{@code notificationRoutes} はBukkit APIに
     * 依存しないため同様にどのスレッドからでも呼べる。Bukkit APIを直接呼ぶ演出
     * ({@link CompletionNotifier#announceCompletion}) だけをメインスレッドへスケジュールする。
     * 高頻度リスナー ({@link #updateItemProgress} など) からのみ呼ぶこと。
     */
    private void persistIfChangedAsync(
            String playerUuid,
            Quest quest,
            List<Map<String, Object>> progress,
            boolean changed) throws Exception {
        if (!changed) return;
        boolean allDone = ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, progress);
        String completedAt = allDone ? Instant.now().toString() : null;
        String progressJson = ProgressManager.MAPPER.writeValueAsString(progress);
        manager.asyncProgressDao.upsertProgress(playerUuid, quest.id, progressJson, allDone, completedAt);
        if (allDone) {
            manager.completionNotifier.applyCompletionDb(playerUuid, quest, manager.asyncProgressDao, manager.asyncCompletionDao);
        }
        if (manager.advancementSyncManager != null) {
            manager.advancementSyncManager.syncPlayerQuestProgress(playerUuid, quest, progressJson);
        }
        if (allDone) {
            Bukkit.getScheduler().runTask(manager.plugin, () -> manager.completionNotifier.announceCompletion(playerUuid, quest));
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
        persistIfChanged(playerUuid, quest, progress, changed);
    }

    void updateItemProgress(String playerUuid, Quest quest, String itemType, int inventoryCount) {
        manager.dbExecutor.submit(() -> {
            try {
                if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest, manager.asyncProgressDao)) return;
                ProgressDao.ProgressRecord record = manager.asyncProgressDao.findByPlayerAndQuest(playerUuid, quest.id);
                List<Map<String, Object>> progress = record == null
                        ? new ArrayList<>()
                        : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

                boolean changed = ConditionEvaluator.applyItem(quest.conditions, progress, itemType, inventoryCount);
                persistIfChangedAsync(playerUuid, quest, progress, changed);
            } catch (Exception e) {
                manager.log.warning("updateItemProgress error: " + e.getMessage());
            }
        });
    }

    void updateStatProgress(String playerUuid, Quest quest, String statType, String statId,
            int currentValue, int previousValue) {
        manager.dbExecutor.submit(() -> {
            try {
                if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest, manager.asyncProgressDao)) return;
                ProgressDao.ProgressRecord record = manager.asyncProgressDao.findByPlayerAndQuest(playerUuid, quest.id);
                List<Map<String, Object>> progress = record == null
                        ? new ArrayList<>()
                        : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

                boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
                boolean changed = ConditionEvaluator.applyStat(quest.conditions, progress, statType, statId,
                        currentValue, previousValue, isRepeat);
                persistIfChangedAsync(playerUuid, quest, progress, changed);
            } catch (Exception e) {
                manager.log.warning("updateStatProgress error: " + e.getMessage());
            }
        });
    }

    void updateScoreboardProgress(String playerUuid, Quest quest, String objective, int score) {
        manager.dbExecutor.submit(() -> {
            try {
                if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest, manager.asyncProgressDao)) return;
                ProgressDao.ProgressRecord record = manager.asyncProgressDao.findByPlayerAndQuest(playerUuid, quest.id);
                List<Map<String, Object>> progress = record == null
                        ? new ArrayList<>()
                        : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

                boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
                boolean changed = ConditionEvaluator.applyScoreboard(quest.conditions, progress, objective, score, isRepeat);
                persistIfChangedAsync(playerUuid, quest, progress, changed);
            } catch (Exception e) {
                manager.log.warning("updateScoreboardProgress error: " + e.getMessage());
            }
        });
    }

    void updateLocationProgress(String playerUuid, Quest quest, int px, int py, int pz, String dimension) {
        manager.dbExecutor.submit(() -> {
            try {
                if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest, manager.asyncProgressDao)) return;
                ProgressDao.ProgressRecord record = manager.asyncProgressDao.findByPlayerAndQuest(playerUuid, quest.id);
                List<Map<String, Object>> progress = record == null
                        ? new ArrayList<>()
                        : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

                boolean changed = ConditionEvaluator.applyLocation(quest.conditions, progress, px, py, pz, dimension);
                persistIfChangedAsync(playerUuid, quest, progress, changed);
            } catch (Exception e) {
                manager.log.warning("updateLocationProgress error: " + e.getMessage());
            }
        });
    }
}
