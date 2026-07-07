package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.db.ProgressDao;
import org.bukkit.Bukkit;

import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

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
                ProgressDao.ProgressRecord rec = readCached(playerUuid.toString(), prereqId, dao);
                if (rec == null || !rec.completed()) return false;
            } catch (SQLException e) {
                manager.log.warning("arePrerequisitesMet error: " + e.getMessage());
                return false;
            }
        }
        return true;
    }

    /**
     * {@code manager.progressCache} を優先して読む findByPlayerAndQuest。dbExecutor スレッド上
     * でのみ呼ぶこと (キャッシュがスレッド非同期のため)。デバウンス中の書き込みが未反映でも、
     * ここを経由すれば常に最新の状態を読める。
     */
    private ProgressDao.ProgressRecord readCached(String playerUuid, int questId, ProgressDao dao) throws SQLException {
        String key = playerUuid + ":" + questId;
        ProgressDao.ProgressRecord cached = manager.progressCache.get(key);
        if (cached != null) return cached;
        ProgressDao.ProgressRecord record = dao.findByPlayerAndQuest(playerUuid, questId);
        if (record != null) manager.progressCache.put(key, record);
        return record;
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
     * {@link #persistIfChanged} の非同期版。
     * <p>
     * クエスト完了時 ({@code allDone}) と、まだキャッシュ/DBにレコードが無い初回書き込み時
     * ({@code baseRecord == null}) は、{@code upsertProgress} と、それに続く完了時のDB処理
     * ({@code CompletionNotifier.applyCompletionDb} の incrementCompletedCount /
     * resetForRepeatWithProgress) を {@code manager.dbExecutor} スレッド上で間にスレッドを
     * 挟まず連続で即時実行する。ここを分割してはいけない: resetForRepeatWithProgress 等は
     * 直前の upsertProgress が既にコミット済みであることを前提に read-modify-write するため、
     * 途中でメインスレッドへのhopを挟んで遅延させると、直後に来る次のイベントの読み取りと
     * レースして更新が失われる (繰り返しクエストの2回目クリアが検出されない、等)。
     * <p>
     * それ以外の (未完了の) 進捗更新は {@link #scheduleDebouncedFlush} でDB書き込みを
     * デバウンスする。エンチャント効率強化+ハイストで秒間50ブロック採掘するような高頻度更新でも、
     * 実際のDB書き込み回数を抑えられる。デバウンス中でも {@code manager.progressCache} を
     * 即座に更新するため、次のイベントの読み取りは常に最新の状態を見る。
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
            ProgressDao.ProgressRecord baseRecord,
            List<Map<String, Object>> progress,
            boolean changed) throws Exception {
        if (!changed) return;
        boolean allDone = ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, progress);
        String completedAt = allDone ? Instant.now().toString() : null;
        String progressJson = ProgressManager.MAPPER.writeValueAsString(progress);
        String key = playerUuid + ":" + quest.id;

        if (allDone || baseRecord == null) {
            ScheduledFuture<?> pending = manager.pendingFlushes.remove(key);
            if (pending != null) pending.cancel(false);
            manager.asyncProgressDao.upsertProgress(playerUuid, quest.id, progressJson, allDone, completedAt);
            if (allDone) {
                manager.completionNotifier.applyCompletionDb(playerUuid, quest, manager.asyncProgressDao, manager.asyncCompletionDao);
            }
            // allDone 後の resetForRepeatWithProgress や、baseRecord==null での自動採番id不明のため、
            // ここではキャッシュに書かず無効化する。次回の読み取りは readCached が自然にDBへフォールバックする。
            manager.progressCache.remove(key);
        } else {
            manager.progressCache.put(key, withUpdatedProgress(baseRecord, progressJson));
            scheduleDebouncedFlush(key, playerUuid, quest.id, progressJson);
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

    /** 未完了の進捗 (completed=false, completedAt=null) でキャッシュエントリを更新する。 */
    private ProgressDao.ProgressRecord withUpdatedProgress(ProgressDao.ProgressRecord base, String progressJson) {
        return new ProgressDao.ProgressRecord(
                base.id(), base.playerUuid(), base.questId(), progressJson, false, base.rewardClaimed(),
                base.startedAt(), base.completedAt(), base.completedCount(), base.pendingRewards());
    }

    /**
     * 未完了の進捗更新をトレーリングデバウンスする。同一キー (playerUuid+questId) への
     * 連続更新は、最後の変更から {@link ProgressManager#DEBOUNCE_MILLIS} 後に最新状態のみ
     * 1回だけ {@code manager.dbExecutor} 上で書き込む。dbExecutor は単一スレッドなので、
     * submit() される通常タスクとこのデバウンスタスクは常に同じスレッド上で時系列順に実行され、
     * 互いにレースしない。
     */
    private void scheduleDebouncedFlush(String key, String playerUuid, int questId, String progressJson) {
        ScheduledFuture<?> task = manager.dbExecutor.schedule(() -> {
            manager.pendingFlushes.remove(key);
            try {
                manager.asyncProgressDao.upsertProgress(playerUuid, questId, progressJson, false, null);
            } catch (SQLException e) {
                manager.log.warning("debounced upsertProgress error: " + e.getMessage());
            }
        }, ProgressManager.DEBOUNCE_MILLIS, TimeUnit.MILLISECONDS);
        ScheduledFuture<?> previous = manager.pendingFlushes.put(key, task);
        if (previous != null) previous.cancel(false);
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
                ProgressDao.ProgressRecord record = readCached(playerUuid, quest.id, manager.asyncProgressDao);
                List<Map<String, Object>> progress = record == null
                        ? new ArrayList<>()
                        : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

                boolean changed = ConditionEvaluator.applyItem(quest.conditions, progress, itemType, inventoryCount);
                persistIfChangedAsync(playerUuid, quest, record, progress, changed);
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
                ProgressDao.ProgressRecord record = readCached(playerUuid, quest.id, manager.asyncProgressDao);
                List<Map<String, Object>> progress = record == null
                        ? new ArrayList<>()
                        : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

                boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
                boolean changed = ConditionEvaluator.applyStat(quest.conditions, progress, statType, statId,
                        currentValue, previousValue, isRepeat);
                persistIfChangedAsync(playerUuid, quest, record, progress, changed);
            } catch (Exception e) {
                manager.log.warning("updateStatProgress error: " + e.getMessage());
            }
        });
    }

    void updateScoreboardProgress(String playerUuid, Quest quest, String objective, int score) {
        manager.dbExecutor.submit(() -> {
            try {
                if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest, manager.asyncProgressDao)) return;
                ProgressDao.ProgressRecord record = readCached(playerUuid, quest.id, manager.asyncProgressDao);
                List<Map<String, Object>> progress = record == null
                        ? new ArrayList<>()
                        : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

                boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
                boolean changed = ConditionEvaluator.applyScoreboard(quest.conditions, progress, objective, score, isRepeat);
                persistIfChangedAsync(playerUuid, quest, record, progress, changed);
            } catch (Exception e) {
                manager.log.warning("updateScoreboardProgress error: " + e.getMessage());
            }
        });
    }

    void updateLocationProgress(String playerUuid, Quest quest, int px, int py, int pz, String dimension) {
        manager.dbExecutor.submit(() -> {
            try {
                if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest, manager.asyncProgressDao)) return;
                ProgressDao.ProgressRecord record = readCached(playerUuid, quest.id, manager.asyncProgressDao);
                List<Map<String, Object>> progress = record == null
                        ? new ArrayList<>()
                        : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

                boolean changed = ConditionEvaluator.applyLocation(quest.conditions, progress, px, py, pz, dimension);
                persistIfChangedAsync(playerUuid, quest, record, progress, changed);
            } catch (Exception e) {
                manager.log.warning("updateLocationProgress error: " + e.getMessage());
            }
        });
    }
}
