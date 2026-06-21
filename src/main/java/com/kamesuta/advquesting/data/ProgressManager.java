package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kamesuta.advquesting.api.NotificationRoutes;
import com.kamesuta.advquesting.api.PlayerRoutes;
import com.kamesuta.advquesting.db.CompletionDao;
import com.kamesuta.advquesting.db.ProgressDao;
import com.kamesuta.advquesting.db.RewardClaimDao;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
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
 * プレイヤーの進捗チェック・更新・報酬付与を行う。
 * Javalin スレッドから呼ばれることがあるので Bukkit API はスケジューラ経由で呼ぶ。
 */
public class ProgressManager {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    private final JavaPlugin plugin;
    private final QuestManager questManager;
    private final ProgressDao progressDao;
    private final CompletionDao completionDao;
    private final RewardClaimDao rewardClaimDao;
    private final Logger log;
    private NotificationRoutes notificationRoutes;

    public ProgressManager(JavaPlugin plugin, QuestManager questManager, ProgressDao progressDao,
                           CompletionDao completionDao, RewardClaimDao rewardClaimDao) {
        this.plugin = plugin;
        this.questManager = questManager;
        this.progressDao = progressDao;
        this.completionDao = completionDao;
        this.rewardClaimDao = rewardClaimDao;
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
        // Bukkit は "minecraft:story/mine_stone" 形式で返すが、UIは "story/mine_stone" 形式で保存する
        // 名前空間なし版も用意して両方にマッチするようにする
        String advKeyNoNs = advancementKey.contains(":") ? advancementKey.substring(advancementKey.indexOf(':') + 1) : advancementKey;
        try {
            for (Quest quest : questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean matched = quest.conditions.stream().anyMatch(c -> {
                    if (!"advancement".equals(c.get("type"))) return false;
                    String condAdvId = (String) c.get("advancementId");
                    if (condAdvId == null) return false;
                    String condNoNs = condAdvId.contains(":") ? condAdvId.substring(condAdvId.indexOf(':') + 1) : condAdvId;
                    return advKeyNoNs.equals(condNoNs);
                });
                if (matched) {
                    markConditionComplete(playerUuid, quest, "advancement", advKeyNoNs);
                }
            }
        } catch (Exception e) {
            log.warning("onAdvancement error: " + e.getMessage());
        }
    }

    /**
     * アイテム獲得時に呼ぶ。
     * inventoryCount はそのアイテムのインベントリ内現在所持数。
     * required 以上所持していれば達成とする（累積カウントしない）。
     */
    public void onItemPickup(String playerUuid, String itemType, int inventoryCount) {
        String itemTypeNoNs = itemType.contains(":") ? itemType.substring(itemType.indexOf(':') + 1) : itemType;
        try {
            for (Quest quest : questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean hasMatch = quest.conditions.stream().anyMatch(c -> {
                    if (!"item".equals(c.get("type"))) return false;
                    String condItemType = (String) c.get("itemType");
                    if (condItemType == null) return false;
                    String condNoNs = condItemType.contains(":") ? condItemType.substring(condItemType.indexOf(':') + 1) : condItemType;
                    return itemTypeNoNs.equals(condNoNs);
                });
                if (hasMatch) {
                    updateItemProgress(playerUuid, quest, itemType, inventoryCount);
                }
            }
        } catch (Exception e) {
            log.warning("onItemPickup error: " + e.getMessage());
        }
    }

    /**
     * 統計値が変化したとき呼ぶ。
     * statType / statId が一致する stat 条件を持つクエストの進捗を更新する。
     * @param statType  "minecraft:mined" など
     * @param statId    "minecraft:diamond" など
     * @param currentValue プレイヤーの現在の統計値 (累積値)
     */
    public void onStat(String playerUuid, String statType, String statId, int currentValue) {
        try {
            for (Quest quest : questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean hasMatch = quest.conditions.stream().anyMatch(c -> {
                    if (!"stat".equals(c.get("type"))) return false;
                    return statType.equals(c.get("statType")) && statId.equals(c.get("statId"));
                });
                if (hasMatch) {
                    updateStatProgress(playerUuid, quest, statType, statId, currentValue);
                }
            }
        } catch (Exception e) {
            log.warning("onStat error: " + e.getMessage());
        }
    }

    /**
     * スコアボードのスコアが変化したとき呼ぶ。
     * objective と score が一致する scoreboard 条件を持つクエストを確認する。
     * @param objective スコアボード名
     * @param score     プレイヤーの現在スコア
     */
    public void onScoreChange(String playerUuid, String objective, int score) {
        try {
            for (Quest quest : questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean hasMatch = quest.conditions.stream().anyMatch(c ->
                    "scoreboard".equals(c.get("type")) && objective.equals(c.get("objective"))
                );
                if (hasMatch) {
                    updateScoreboardProgress(playerUuid, quest, objective, score);
                }
            }
        } catch (Exception e) {
            log.warning("onScoreChange error: " + e.getMessage());
        }
    }

    /**
     * プレイヤーが移動したとき呼ぶ。
     * location 条件を持つクエストを確認し、座標が半径内に入っていれば達成とする。
     * @param dimension "overworld" / "nether" / "end"
     */
    public void onPlayerMove(String playerUuid, int x, int y, int z, String dimension) {
        try {
            for (Quest quest : questManager.loadAll()) {
                if (!"public".equals(quest.status)) continue;
                if (quest.conditions == null) continue;
                boolean hasMatch = quest.conditions.stream().anyMatch(c ->
                    "location".equals(c.get("type")) && dimension.equals(c.get("dimension"))
                );
                if (hasMatch) {
                    updateLocationProgress(playerUuid, quest, x, y, z, dimension);
                }
            }
        } catch (Exception e) {
            log.warning("onPlayerMove error: " + e.getMessage());
        }
    }

    /**
     * チェックマーク条件をWebUIから手動で完了する。
     * conditionId が checkmark 型の条件と一致する場合のみ処理する。
     * @return true: 完了に成功、false: 条件が存在しないか既に完了済み
     */
    public boolean completeCheckmarkCondition(String playerUuid, int questId, String conditionId) throws SQLException {
        Quest quest = questManager.findById(questId);
        if (quest == null || quest.conditions == null) return false;

        // checkmark 型かどうか確認
        boolean isCheckmark = quest.conditions.stream().anyMatch(c ->
            "checkmark".equals(c.get("type")) && conditionId.equals(c.get("id"))
        );
        if (!isCheckmark) return false;

        try {
            ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, questId);
            List<Map<String, Object>> progress = record == null
                ? new ArrayList<>()
                : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

            // 既に完了済みなら何もしない
            boolean alreadyDone = progress.stream()
                .anyMatch(p -> conditionId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (alreadyDone) return false;

            progress.removeIf(p -> conditionId.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", conditionId, "completed", true));

            boolean allDone = isAllConditionsMet(quest, progress);
            // checkmark を含む全条件達成チェック (checkmark は手動なので skip せずに確認する)
            if (!allDone) {
                allDone = isAllConditionsMetIncludingCheckmarks(quest, progress);
            }
            String completedAt = allDone ? java.time.Instant.now().toString() : null;
            progressDao.upsertProgress(playerUuid, questId, MAPPER.writeValueAsString(progress), allDone, completedAt);

            if (allDone) {
                notifyQuestComplete(playerUuid, quest);
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
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return 0;

        ProgressDao.ProgressRecord rec = progressDao.findByPlayerAndQuest(playerUuid, questId);
        if (rec == null) return 0;

        // 繰り返しクエストは pending_rewards を全部消費、非繰り返しは従来の markRewardClaimed
        boolean isRepeat = quest.repeat != null && !"none".equals(quest.repeat.type);
        int claimed = 0;
        if (isRepeat) {
            while (progressDao.claimOnePendingReward(playerUuid, questId)) {
                claimed++;
            }
        } else {
            boolean ok = progressDao.markRewardClaimed(playerUuid, questId);
            claimed = ok ? 1 : 0;
        }
        if (claimed == 0) return 0;

        // 報酬受取ログを追記 (受け取った回数ぶん明細を残す)。プレイヤーがオフラインでも記録する。
        try {
            for (int i = 0; i < claimed; i++) {
                rewardClaimDao.insertQuestRewards(playerUuid, playerUuidToName(playerUuid),
                    quest.id, quest.title, quest.rewards, Instant.now().toString(), "claim");
            }
        } catch (Exception e) {
            log.warning("reward claim log insert error: " + e.getMessage());
        }

        Player player = Bukkit.getPlayer(java.util.UUID.fromString(playerUuid));
        if (player == null) return claimed;

        List<Map<String, Object>> rewards = quest.rewards;
        final int times = claimed;
        Bukkit.getScheduler().runTask(plugin, () -> {
            for (int i = 0; i < times; i++) giveRewards(player, rewards);
        });
        return claimed;
    }

    /** 納品結果: conditionId → 納品数 */
    public record DeliveryResult(Map<String, Integer> delivered, Map<String, Integer> failed) {}

    /**
     * WebUI から「納品する」を押したときに呼ぶ。
     * delivery 条件ごとにプレイヤーのインベントリからアイテムを消費し、進捗を更新する。
     * Javalin スレッドから呼ばれるため、Bukkit API は CompletableFuture でメインスレッドに委譲する。
     */
    public DeliveryResult deliverItems(String playerUuid, int questId) throws Exception {
        Quest quest = questManager.findById(questId);
        if (quest == null || quest.conditions == null) return new DeliveryResult(Map.of(), Map.of());
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return new DeliveryResult(Map.of(), Map.of());

        // delivery 条件のみ抽出
        List<Map<String, Object>> deliveryConds = quest.conditions.stream()
            .filter(c -> "delivery".equals(c.get("type")))
            .toList();
        if (deliveryConds.isEmpty()) return new DeliveryResult(Map.of(), Map.of());

        Player player = Bukkit.getPlayer(java.util.UUID.fromString(playerUuid));
        if (player == null) return new DeliveryResult(Map.of(), Map.of());

        // 既存進捗を読む
        ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, questId);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

        Map<String, Integer> delivered = new HashMap<>();
        Map<String, Integer> failed = new HashMap<>();

        // メインスレッドでインベントリ操作
        CompletableFuture<Void> future = new CompletableFuture<>();
        Bukkit.getScheduler().runTask(plugin, () -> {
            try {
                for (Map<String, Object> cond : deliveryConds) {
                    String condId = (String) cond.get("id");
                    if (condId == null) continue;

                    // 既に完了済みならスキップ
                    boolean alreadyDone = progress.stream()
                        .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
                    if (alreadyDone) continue;

                    String itemType = (String) cond.getOrDefault("itemType", "stone");
                    int required = ((Number) cond.getOrDefault("count", 1)).intValue();

                    // 現在の納品済み数
                    Map<String, Object> existing = progress.stream()
                        .filter(p -> condId.equals(p.get("conditionId")))
                        .findFirst().orElse(null);
                    int alreadyDelivered = existing == null ? 0 : ((Number) existing.getOrDefault("current", 0)).intValue();
                    int stillNeeded = required - alreadyDelivered;
                    if (stillNeeded <= 0) continue;

                    // itemType の名前空間を除去して Material を解決
                    String matName = itemType.contains(":")
                        ? itemType.substring(itemType.indexOf(':') + 1).toUpperCase()
                        : itemType.toUpperCase();
                    org.bukkit.Material mat = org.bukkit.Material.matchMaterial(matName);
                    if (mat == null) { failed.put(condId, stillNeeded); continue; }

                    // インベントリから持っている数を数える
                    int haveCount = 0;
                    for (org.bukkit.inventory.ItemStack slot : player.getInventory().getContents()) {
                        if (slot != null && slot.getType() == mat) haveCount += slot.getAmount();
                    }
                    if (haveCount == 0) { failed.put(condId, stillNeeded); continue; }

                    // 実際に消費する数 (持っている数と必要数の小さい方)
                    int toConsume = Math.min(haveCount, stillNeeded);
                    org.bukkit.inventory.ItemStack toRemove = new org.bukkit.inventory.ItemStack(mat, toConsume);
                    player.getInventory().removeItem(toRemove);
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

        // delivery を含む全条件を確認 (isAllConditionsMet は delivery をスキップするため全条件版を使う)
        boolean allDone = isAllConditionsMetIncludingCheckmarks(quest, progress);
        String completedAt = allDone ? Instant.now().toString() : null;
        try {
            progressDao.upsertProgress(playerUuid, questId, MAPPER.writeValueAsString(progress), allDone, completedAt);
        } catch (Exception e) {
            log.warning("deliverItems upsert error: " + e.getMessage());
        }

        if (allDone) {
            notifyQuestComplete(playerUuid, quest);
        } else if (notificationRoutes != null) {
            notificationRoutes.sendProgressUpdate(playerUuid, questId, false);
        }

        return new DeliveryResult(delivered, failed);
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

    /**
     * 前提クエストが全て完了しているか確認する。
     * prerequisites リストが空または null の場合は true を返す。
     */
    private boolean arePrerequisitesMet(UUID playerUuid, Quest quest) {
        if (quest.prerequisites == null || quest.prerequisites.isEmpty()) return true;
        for (int prereqId : quest.prerequisites) {
            try {
                ProgressDao.ProgressRecord rec = progressDao.findByPlayerAndQuest(playerUuid.toString(), prereqId);
                if (rec == null || !rec.completed()) return false;
            } catch (SQLException e) {
                log.warning("arePrerequisitesMet error: " + e.getMessage());
                return false;
            }
        }
        return true;
    }

    private void markConditionComplete(String playerUuid, Quest quest, String condType, String condValue)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

        boolean changed = false;
        for (Map<String, Object> cond : quest.conditions) {
            if (!condType.equals(cond.get("type"))) continue;
            // advancement は名前空間なし版で比較 (例: "story/mine_stone" と "minecraft:story/mine_stone" を同一視)
            if ("advancement".equals(condType)) {
                String condAdvId = (String) cond.get("advancementId");
                if (condAdvId == null) continue;
                String condNoNs = condAdvId.contains(":") ? condAdvId.substring(condAdvId.indexOf(':') + 1) : condAdvId;
                if (!condValue.equals(condNoNs)) continue;
            } else {
                if (!condValue.equals(cond.get("advancementId"))) continue;
            }
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
        } else if (notificationRoutes != null) {
            notificationRoutes.sendProgressUpdate(playerUuid, quest.id, false);
        }
    }

    private void updateItemProgress(String playerUuid, Quest quest, String itemType, int inventoryCount)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

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

            // 一度に required 個以上持っていなければ達成しない
            if (inventoryCount < required) continue;

            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", condId, "completed", true));
            changed = true;
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
        String completedAt = allDone ? Instant.now().toString() : null;
        progressDao.upsertProgress(playerUuid, quest.id, MAPPER.writeValueAsString(progress), allDone, completedAt);

        if (allDone) {
            notifyQuestComplete(playerUuid, quest);
        } else if (notificationRoutes != null) {
            notificationRoutes.sendProgressUpdate(playerUuid, quest.id, false);
        }
    }

    /** stat 条件の進捗を更新する。currentValue が required 以上になったら達成。 */
    private void updateStatProgress(String playerUuid, Quest quest, String statType, String statId, int currentValue)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

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

            int capped = Math.min(currentValue, required);
            boolean nowDone = currentValue >= required;
            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", condId, "current", capped, "required", required, "completed", nowDone));
            changed = true;
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
        String completedAt = allDone ? Instant.now().toString() : null;
        progressDao.upsertProgress(playerUuid, quest.id, MAPPER.writeValueAsString(progress), allDone, completedAt);

        if (allDone) {
            notifyQuestComplete(playerUuid, quest);
        } else if (notificationRoutes != null) {
            notificationRoutes.sendProgressUpdate(playerUuid, quest.id, false);
        }
    }

    private boolean isAllConditionsMet(Quest quest, List<Map<String, Object>> progress) {
        if (quest.conditions == null || quest.conditions.isEmpty()) return false;
        for (Map<String, Object> cond : quest.conditions) {
            // checkmark / delivery 型はWebUIから手動操作するので自動達成しない
            String condType = (String) cond.get("type");
            if ("checkmark".equals(condType) || "delivery".equals(condType)) continue;
            String condId = (String) cond.get("id");
            boolean done = progress.stream()
                .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (!done) return false;
        }
        return true;
    }

    /** scoreboard 条件の進捗を確認し、スコアが目標値以上なら達成とする。 */
    private void updateScoreboardProgress(String playerUuid, Quest quest, String objective, int score)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

        boolean changed = false;
        for (Map<String, Object> cond : quest.conditions) {
            if (!"scoreboard".equals(cond.get("type"))) continue;
            if (!objective.equals(cond.get("objective"))) continue;
            String condId = (String) cond.get("id");
            int required = ((Number) cond.getOrDefault("score", 1)).intValue();

            boolean alreadyDone = progress.stream()
                .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (alreadyDone) continue;

            int capped = Math.min(score, required);
            boolean nowDone = score >= required;
            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", condId, "current", capped, "required", required, "completed", nowDone));
            changed = true;
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
        String completedAt = allDone ? java.time.Instant.now().toString() : null;
        progressDao.upsertProgress(playerUuid, quest.id, MAPPER.writeValueAsString(progress), allDone, completedAt);

        if (allDone) {
            notifyQuestComplete(playerUuid, quest);
        } else if (notificationRoutes != null) {
            notificationRoutes.sendProgressUpdate(playerUuid, quest.id, false);
        }
    }

    /** location 条件の進捗を確認し、半径内に入っていれば達成とする。 */
    private void updateLocationProgress(String playerUuid, Quest quest, int px, int py, int pz, String dimension)
            throws Exception {
        if (!arePrerequisitesMet(UUID.fromString(playerUuid), quest)) return;
        ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
        List<Map<String, Object>> progress = record == null
            ? new ArrayList<>()
            : MAPPER.readValue(record.progress(), LIST_MAP_TYPE);

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

            // 水平距離のみ (Y軸は無視して地表・高さ変化に寛容にする)
            int dx = px - cx, dz = pz - cz;
            boolean inRange = (dx * dx + dz * dz) <= (radius * radius);
            if (!inRange) continue;

            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", condId, "completed", true));
            changed = true;
        }
        if (!changed) return;

        boolean allDone = isAllConditionsMet(quest, progress);
        if (!allDone) allDone = isAllConditionsMetIncludingCheckmarks(quest, progress);
        String completedAt = allDone ? java.time.Instant.now().toString() : null;
        progressDao.upsertProgress(playerUuid, quest.id, MAPPER.writeValueAsString(progress), allDone, completedAt);

        if (allDone) {
            notifyQuestComplete(playerUuid, quest);
        } else if (notificationRoutes != null) {
            notificationRoutes.sendProgressUpdate(playerUuid, quest.id, false);
        }
    }

    /** checkmark を含む全条件が完了しているか確認する (checkmark 手動完了時に使用) */
    private boolean isAllConditionsMetIncludingCheckmarks(Quest quest, List<Map<String, Object>> progress) {
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
     * クエスト完了時の共通処理: pending_rewards インクリメント + 通知 + 繰り返しリセット。
     * upsertProgress で completed=true にした後に呼ぶ。
     */
    private void notifyQuestComplete(String playerUuid, Quest quest) {
        // pending_rewards をインクリメント
        try {
            progressDao.incrementCompletedCount(playerUuid, quest.id);
        } catch (Exception e) {
            log.warning("incrementCompletedCount error: " + e.getMessage());
        }

        // クリアログを追記 (ランキングの真実のソース。繰り返しは完了のたびに積まれる)
        try {
            completionDao.insert(playerUuid, playerUuidToName(playerUuid), quest.id, Instant.now().toString());
        } catch (Exception e) {
            log.warning("completion log insert error: " + e.getMessage());
        }

        // SSE でブラウザに通知 (Javalin スレッドから呼べる)
        if (notificationRoutes != null) {
            notificationRoutes.sendQuestComplete(playerUuid, quest.id, quest.title,
                playerUuidToName(playerUuid));
        }

        // 繰り返しタイプ処理
        Quest.RepeatConfig repeat = quest.repeat;
        if (repeat != null) {
            if ("unlimited".equals(repeat.type)) {
                // 即座にリセット
                try {
                    progressDao.resetForRepeat(playerUuid, quest.id);
                } catch (Exception e) {
                    log.warning("resetForRepeat (unlimited) error: " + e.getMessage());
                }
            } else if ("cooldown".equals(repeat.type)) {
                // cooldown は ProgressRoutes の /status で残り時間を返すので、ここでは何もしない
                // (クライアントが completedAt から計算する)
            }
            // schedule は RepeatScheduler が毎分チェックしてリセットする
        }

        Player player = Bukkit.getPlayer(UUID.fromString(playerUuid));
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
        java.util.UUID uuid = java.util.UUID.fromString(playerUuid);
        Player online = Bukkit.getPlayer(uuid);
        if (online != null) return online.getName();
        // オフライン: キャッシュ済みの名前を解決 (ランキング表示用)
        String offlineName = Bukkit.getOfflinePlayer(uuid).getName();
        if (offlineName != null) return offlineName;
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
                    if (itemStack != null) {
                        player.getWorld().dropItem(player.getLocation(), itemStack);
                    }
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
            } else if ("point".equals(type)) {
                int amount = ((Number) reward.getOrDefault("amount", 0)).intValue();
                // config.yml の point-command テンプレートを使ってポイントを付与する
                // {player} → プレイヤー名、{amount} → 付与ポイント数 に置換
                String template = plugin.getConfig().getString(
                    "point-command", "scoreboard players add {player} point {amount}");
                String cmd = template
                    .replace("{player}", player.getName())
                    .replace("{amount}", String.valueOf(amount));
                Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd);
            }
        }
        player.sendMessage("§a報酬を受け取りました！");
    }
}
