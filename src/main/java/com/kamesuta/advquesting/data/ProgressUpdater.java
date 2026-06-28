package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.kamesuta.advquesting.db.ProgressDao;

import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 条件別の進捗更新ロジックと判定ヘルパー。 */
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

    // ---- 条件達成判定 ----

    boolean isAllConditionsMet(Quest quest, List<Map<String, Object>> progress) {
        if (quest.conditions == null || quest.conditions.isEmpty()) return false;
        for (Map<String, Object> cond : quest.conditions) {
            String condType = (String) cond.get("type");
            if ("checkmark".equals(condType) || "delivery".equals(condType)) continue;
            String condId = (String) cond.get("id");
            boolean done = progress.stream()
                .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (!done) return false;
        }
        return true;
    }

    boolean isAllConditionsMetIncludingCheckmarks(Quest quest, List<Map<String, Object>> progress) {
        if (quest.conditions == null || quest.conditions.isEmpty()) return false;
        for (Map<String, Object> cond : quest.conditions) {
            String condId = (String) cond.get("id");
            boolean done = progress.stream()
                .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (!done) return false;
        }
        return true;
    }

    /**
     * 繰り返しリセット用の新しい進捗JSONを生成する。
     * stat/scoreboard 条件は前回クリア時の rawValue を新しい baseValue として引き継ぐ。
     */
    static String buildResetProgressJson(Quest quest, List<Map<String, Object>> completedProgress) throws Exception {
        if (quest.conditions == null) return "[]";
        List<Map<String, Object>> newProgress = new ArrayList<>();
        for (Map<String, Object> cond : quest.conditions) {
            String condType = (String) cond.get("type");
            String condId = (String) cond.get("id");
            if (condId == null) continue;
            if (!"stat".equals(condType) && !"scoreboard".equals(condType)) continue;

            Map<String, Object> existing = completedProgress.stream()
                .filter(p -> condId.equals(p.get("conditionId")))
                .findFirst().orElse(null);
            int rawValue = existing != null && existing.get("rawValue") instanceof Number n ? n.intValue() : 0;
            int required = "stat".equals(condType)
                ? ((Number) cond.getOrDefault("count", 1)).intValue()
                : ((Number) cond.getOrDefault("score", 1)).intValue();

            Map<String, Object> entry = new HashMap<>();
            entry.put("conditionId", condId);
            entry.put("current", 0);
            entry.put("required", required);
            entry.put("baseValue", rawValue);
            entry.put("rawValue", rawValue);
            entry.put("completed", false);
            newProgress.add(entry);
        }
        return ProgressManager.MAPPER.writeValueAsString(newProgress);
    }

    // ---- 各条件タイプの進捗更新 ----

    void markConditionComplete(String playerUuid, Quest quest, String condType, String condValue)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        boolean changed = false;
        for (Map<String, Object> cond : quest.conditions) {
            if (!condType.equals(cond.get("type"))) continue;
            if ("advancement".equals(condType)) {
                String condAdvId = (String) cond.get("advancementId");
                if (condAdvId == null) continue;
                String condNoNs = condAdvId.contains(":") ? condAdvId.substring(condAdvId.indexOf(':') + 1) : condAdvId;
                if (!condValue.equals(condNoNs)) continue;
            } else {
                if (!condValue.equals(cond.get("advancementId"))) continue;
            }
            String condId = (String) cond.get("id");
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

    void updateItemProgress(String playerUuid, Quest quest, String itemType, int inventoryCount)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        String itemTypeNoNs = itemType.contains(":") ? itemType.substring(itemType.indexOf(':') + 1) : itemType;
        boolean changed = false;
        for (Map<String, Object> cond : quest.conditions) {
            if (!"item".equals(cond.get("type"))) continue;
            String condItemType = (String) cond.get("itemType");
            if (condItemType == null) continue;
            String condNoNs = condItemType.contains(":") ? condItemType.substring(condItemType.indexOf(':') + 1) : condItemType;
            if (!itemTypeNoNs.equals(condNoNs)) continue;
            String condId = (String) cond.get("id");
            int required = ((Number) cond.getOrDefault("count", 1)).intValue();
            boolean wasCompleted = progress.stream()
                .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (wasCompleted) continue;
            if (inventoryCount < required) continue;
            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", condId, "completed", true));
            changed = true;
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
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

    void updateStatProgress(String playerUuid, Quest quest, String statType, String statId, int currentValue)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
        boolean changed = false;
        for (Map<String, Object> cond : quest.conditions) {
            if (!"stat".equals(cond.get("type"))) continue;
            if (!statType.equals(cond.get("statType"))) continue;
            if (!statId.equals(cond.get("statId"))) continue;
            String condId = (String) cond.get("id");
            int required = ((Number) cond.getOrDefault("count", 1)).intValue();
            Map<String, Object> existing = progress.stream()
                .filter(p -> condId.equals(p.get("conditionId")))
                .findFirst().orElse(null);
            boolean wasCompleted = existing != null && Boolean.TRUE.equals(existing.get("completed"));
            if (wasCompleted) continue;
            int baseValue = existing != null && existing.get("baseValue") instanceof Number n ? n.intValue() : 0;
            int diff = currentValue - baseValue;
            int capped = Math.min(diff, required);
            boolean nowDone = diff >= required;
            Map<String, Object> entry = new HashMap<>();
            entry.put("conditionId", condId);
            entry.put("current", capped);
            entry.put("required", required);
            entry.put("completed", nowDone);
            if (isRepeat) { entry.put("baseValue", baseValue); entry.put("rawValue", currentValue); }
            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(entry);
            changed = true;
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
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

    void updateScoreboardProgress(String playerUuid, Quest quest, String objective, int score)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
        boolean changed = false;
        for (Map<String, Object> cond : quest.conditions) {
            if (!"scoreboard".equals(cond.get("type"))) continue;
            if (!objective.equals(cond.get("objective"))) continue;
            String condId = (String) cond.get("id");
            int required = ((Number) cond.getOrDefault("score", 1)).intValue();
            Map<String, Object> existing = progress.stream()
                .filter(p -> condId.equals(p.get("conditionId")))
                .findFirst().orElse(null);
            boolean alreadyDone = existing != null && Boolean.TRUE.equals(existing.get("completed"));
            if (alreadyDone) continue;
            int baseValue = existing != null && existing.get("baseValue") instanceof Number n ? n.intValue() : 0;
            int diff = score - baseValue;
            int capped = Math.min(diff, required);
            boolean nowDone = diff >= required;
            Map<String, Object> entry = new HashMap<>();
            entry.put("conditionId", condId);
            entry.put("current", capped);
            entry.put("required", required);
            entry.put("completed", nowDone);
            if (isRepeat) { entry.put("baseValue", baseValue); entry.put("rawValue", score); }
            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(entry);
            changed = true;
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
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

    void updateLocationProgress(String playerUuid, Quest quest, int px, int py, int pz, String dimension)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = manager.progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : ProgressManager.MAPPER.readValue(record.progress(), ProgressManager.LIST_MAP_TYPE);

        boolean changed = false;
        for (Map<String, Object> cond : quest.conditions) {
            if (!"location".equals(cond.get("type"))) continue;
            if (!dimension.equals(cond.get("dimension"))) continue;
            String condId = (String) cond.get("id");
            int cx = ((Number) cond.getOrDefault("x", 0)).intValue();
            int cz = ((Number) cond.getOrDefault("z", 0)).intValue();
            int radius = ((Number) cond.getOrDefault("radius", 10)).intValue();
            boolean alreadyDone = progress.stream()
                .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (alreadyDone) continue;
            int dx = px - cx, dz = pz - cz;
            if ((dx * dx + dz * dz) > (radius * radius)) continue;
            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", condId, "completed", true));
            changed = true;
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
        if (!allDone) allDone = isAllConditionsMetIncludingCheckmarks(quest, progress);
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
}
