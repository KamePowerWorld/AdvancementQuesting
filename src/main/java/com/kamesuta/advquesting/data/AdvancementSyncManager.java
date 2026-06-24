package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kamesuta.advquesting.db.ProgressDao;
import org.bukkit.Bukkit;
import org.bukkit.NamespacedKey;
import org.bukkit.advancement.Advancement;
import org.bukkit.advancement.AdvancementProgress;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.logging.Logger;

/**
 * クエストを Minecraft の進捗（Advancement）画面に表示する。
 * プラグイン起動時にクエストを Advancement として登録し、
 * プレイヤーの条件達成に合わせて criterion を award/revoke する。
 */
public class AdvancementSyncManager {

    private static final String NAMESPACE = "advquesting";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    private final JavaPlugin plugin;
    private final QuestManager questManager;
    private final ProgressDao progressDao;
    private final Logger log;

    public AdvancementSyncManager(JavaPlugin plugin, QuestManager questManager, ProgressDao progressDao) {
        this.plugin = plugin;
        this.questManager = questManager;
        this.progressDao = progressDao;
        this.log = plugin.getLogger();
    }

    /** サーバー起動時: root と public クエスト全件を Advancement 登録する。*/
    public void loadAll() {
        loadRoot();
        for (Quest quest : questManager.loadAll()) {
            if ("public".equals(quest.status)) {
                loadQuestAdvancement(quest);
            }
        }
    }

    /**
     * プラグイン無効時: 全プレイヤーの advquesting 進捗を消去し Advancement を削除する。
     * オンラインプレイヤーは Bukkit API で revoke、オフラインプレイヤーはワールドの
     * advancements/*.json から advquesting:* キーを直接削除する。
     */
    public void unloadAll() {
        // オンラインプレイヤーの criteria を revoke
        for (Player player : Bukkit.getOnlinePlayers()) {
            revokeAllAdvQuestingCriteriaForPlayer(player);
        }
        // 全プレイヤーのアドバンスメントファイルから advquesting:* を削除
        cleanAllPlayerAdvancementFiles();
        // Advancement を unload
        removeAdvancementSafe(rootKey());
        for (Quest quest : questManager.loadAll()) {
            removeAdvancementSafe(questKey(quest.id));
        }
    }

    /** 指定プレイヤーの advquesting:* に関する criteria を全て revoke する。*/
    private void revokeAllAdvQuestingCriteriaForPlayer(Player player) {
        Advancement root = Bukkit.getAdvancement(rootKey());
        if (root != null) {
            AdvancementProgress ap = player.getAdvancementProgress(root);
            for (String c : new HashSet<>(ap.getAwardedCriteria())) ap.revokeCriteria(c);
        }
        for (Quest quest : questManager.loadAll()) {
            revokeAllCriteriaForPlayer(player, quest.id);
        }
    }

    /**
     * ワールドの advancements/*.json から advquesting:* キーを削除する。
     * オフラインプレイヤーのデータを含む全ファイルを対象とする。
     */
    private void cleanAllPlayerAdvancementFiles() {
        if (Bukkit.getWorlds().isEmpty()) return;
        File advFolder = new File(Bukkit.getWorlds().get(0).getWorldFolder(), "advancements");
        if (!advFolder.isDirectory()) return;
        File[] files = advFolder.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) return;
        for (File file : files) {
            try {
                removeAdvQuestingKeysFromFile(file);
            } catch (Exception e) {
                log.warning("進捗ファイルのクリーンアップ失敗 " + file.getName() + ": " + e.getMessage());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void removeAdvQuestingKeysFromFile(File file) throws Exception {
        String content = Files.readString(file.toPath());
        Map<String, Object> data = MAPPER.readValue(content, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        boolean changed = data.entrySet().removeIf(e -> e.getKey().startsWith(NAMESPACE + ":"));
        if (changed) {
            Files.writeString(file.toPath(), MAPPER.writeValueAsString(data));
        }
    }

    /**
     * クエスト作成/更新時に呼ぶ。Bukkit main thread から呼ぶこと。
     * public なら再登録し全オンラインプレイヤーの進捗を同期する。
     */
    public void syncQuest(Quest quest) {
        removeAdvancementSafe(questKey(quest.id));
        if ("public".equals(quest.status)) {
            loadQuestAdvancement(quest);
            for (Player player : Bukkit.getOnlinePlayers()) {
                syncAllQuestsForPlayer(player);
            }
        } else {
            for (Player player : Bukkit.getOnlinePlayers()) {
                revokeAllCriteriaForPlayer(player, quest.id);
            }
        }
    }

    /**
     * クエスト削除時に呼ぶ。Bukkit main thread から呼ぶこと。
     * 全オンラインプレイヤーの criteria を revoke してから Advancement を削除する。
     */
    public void removeQuest(int questId) {
        NamespacedKey key = questKey(questId);
        Advancement adv = Bukkit.getAdvancement(key);
        if (adv != null) {
            for (Player player : Bukkit.getOnlinePlayers()) {
                AdvancementProgress ap = player.getAdvancementProgress(adv);
                for (String criterion : new HashSet<>(ap.getAwardedCriteria())) {
                    ap.revokeCriteria(criterion);
                }
            }
        }
        removeAdvancementSafe(key);
    }

    /**
     * 指定プレイヤーの指定クエストの criterion 状態を progressJson に合わせて同期する。
     * Javalin スレッドから呼ばれるため Bukkit main thread に委譲する。
     */
    public void syncPlayerQuestProgress(String playerUuid, Quest quest, String progressJson) {
        Player player = Bukkit.getPlayer(java.util.UUID.fromString(playerUuid));
        if (player == null) return;
        NamespacedKey key = questKey(quest.id);
        Advancement adv = Bukkit.getAdvancement(key);
        if (adv == null) return;

        Bukkit.getScheduler().runTask(plugin, () ->
            applyProgressToPlayer(player, adv, quest, progressJson));
    }

    /**
     * ログイン時に全クエストの進捗を一括同期する。Bukkit main thread から呼ぶこと。
     */
    public void syncAllQuestsForPlayer(Player player) {
        grantRootCriterion(player);
        String playerUuid = player.getUniqueId().toString();
        for (Quest quest : questManager.loadAll()) {
            if (!"public".equals(quest.status)) continue;
            NamespacedKey key = questKey(quest.id);
            Advancement adv = Bukkit.getAdvancement(key);
            if (adv == null) continue;
            try {
                ProgressDao.ProgressRecord rec = progressDao.findByPlayerAndQuest(playerUuid, quest.id);
                applyProgressToPlayer(player, adv, quest, rec != null ? rec.progress() : null);
            } catch (Exception e) {
                log.warning("syncAllQuestsForPlayer error for quest " + quest.id + ": " + e.getMessage());
            }
        }
    }

    // ---- private helpers ----

    private void loadRoot() {
        NamespacedKey key = rootKey();
        removeAdvancementSafe(key);
        try {
            Bukkit.getUnsafe().loadAdvancement(key, buildRootJson());
        } catch (Exception e) {
            log.warning("Failed to load root advancement: " + e.getMessage());
        }
    }

    private void loadQuestAdvancement(Quest quest) {
        try {
            Bukkit.getUnsafe().loadAdvancement(questKey(quest.id), buildAdvancementJson(quest));
        } catch (Exception e) {
            log.warning("Failed to load advancement for quest " + quest.id + ": " + e.getMessage());
        }
    }

    private void grantRootCriterion(Player player) {
        Advancement root = Bukkit.getAdvancement(rootKey());
        if (root == null) return;
        player.getAdvancementProgress(root).awardCriteria("root");
    }

    private void revokeAllCriteriaForPlayer(Player player, int questId) {
        Advancement adv = Bukkit.getAdvancement(questKey(questId));
        if (adv == null) return;
        AdvancementProgress ap = player.getAdvancementProgress(adv);
        for (String criterion : new HashSet<>(ap.getAwardedCriteria())) {
            ap.revokeCriteria(criterion);
        }
    }

    private void applyProgressToPlayer(Player player, Advancement adv, Quest quest, String progressJson) {
        if (quest.conditions == null || quest.conditions.isEmpty()) return;
        Map<String, Boolean> completedMap = parseProgress(progressJson);
        AdvancementProgress ap = player.getAdvancementProgress(adv);
        for (Map<String, Object> cond : quest.conditions) {
            String condId = (String) cond.get("id");
            if (condId == null) continue;
            String criterionName = "c_" + sanitizeCriterionName(condId);
            boolean shouldAward = completedMap.getOrDefault(condId, false);
            boolean isAwarded = ap.getAwardedCriteria().contains(criterionName);
            if (shouldAward && !isAwarded) {
                ap.awardCriteria(criterionName);
            } else if (!shouldAward && isAwarded) {
                ap.revokeCriteria(criterionName);
            }
        }
    }

    private Map<String, Boolean> parseProgress(String progressJson) {
        if (progressJson == null || progressJson.isBlank()) return Map.of();
        try {
            List<Map<String, Object>> list = MAPPER.readValue(progressJson, LIST_MAP_TYPE);
            Map<String, Boolean> result = new HashMap<>();
            for (Map<String, Object> entry : list) {
                String condId = (String) entry.get("conditionId");
                if (condId == null) continue;
                result.put(condId, Boolean.TRUE.equals(entry.get("completed")));
            }
            return result;
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String buildRootJson() {
        return "{\"display\":{\"icon\":{\"id\":\"minecraft:writable_book\"},\"title\":{\"text\":\"クエスト\"}," +
               "\"description\":{\"text\":\"クエスト一覧\"}," +
               "\"background\":\"minecraft:block/smooth_stone\"," +
               "\"frame\":\"task\",\"show_toast\":false,\"announce_to_chat\":false}," +
               "\"criteria\":{\"root\":{\"trigger\":\"minecraft:impossible\"}}}";
    }

    private String buildAdvancementJson(Quest quest) {
        List<String> criteriaNames = new ArrayList<>();
        StringBuilder criteriaJson = new StringBuilder();

        if (quest.conditions != null) {
            for (Map<String, Object> cond : quest.conditions) {
                String condId = (String) cond.get("id");
                if (condId == null) continue;
                String criterionName = "c_" + sanitizeCriterionName(condId);
                criteriaNames.add(criterionName);
                if (criteriaJson.length() > 0) criteriaJson.append(",");
                criteriaJson.append("\"").append(criterionName).append("\":{\"trigger\":\"minecraft:impossible\"}");
            }
        }

        if (criteriaNames.isEmpty()) {
            criteriaJson.append("\"_root\":{\"trigger\":\"minecraft:impossible\"}");
            criteriaNames.add("_root");
        }

        String requirements = criteriaNames.stream()
            .map(n -> "[\"" + n + "\"]")
            .collect(Collectors.joining(","));

        // 依存クエストを parent に設定（Minecraft advancement は parent が1つのみのため先頭を使用）
        String parentKey = resolveParentKey(quest);

        String iconId = toMinecraftItem(quest.icon);
        String title = escapeJson(quest.title != null ? quest.title : "クエスト #" + quest.id);
        String description = escapeJson(buildDescription(quest));

        return "{\"display\":{\"icon\":{\"id\":\"" + iconId + "\"}," +
               "\"title\":{\"text\":\"" + title + "\"}," +
               "\"description\":{\"text\":\"" + description + "\"}," +
               "\"frame\":\"task\",\"show_toast\":false,\"announce_to_chat\":false,\"hidden\":false}," +
               "\"parent\":\"" + parentKey + "\"," +
               "\"criteria\":{" + criteriaJson + "}," +
               "\"requirements\":[" + requirements + "]}";
    }

    /**
     * クエストの parent advancement key を解決する。
     * prerequisites があれば先頭の public クエストを親にし、なければ root を返す。
     */
    private String resolveParentKey(Quest quest) {
        if (quest.prerequisites == null || quest.prerequisites.isEmpty()) {
            return "advquesting:root";
        }
        for (int prereqId : quest.prerequisites) {
            Quest prereq = questManager.findById(prereqId);
            if (prereq != null && "public".equals(prereq.status)) {
                return "advquesting:q" + prereqId;
            }
        }
        return "advquesting:root";
    }

    private String buildDescription(Quest quest) {
        StringBuilder sb = new StringBuilder();
        if (quest.subtitle != null && !quest.subtitle.isBlank()) {
            sb.append(quest.subtitle).append("\n");
        }
        int condCount = quest.conditions == null ? 0 : quest.conditions.size();
        if (condCount > 0) {
            sb.append("全").append(condCount).append("つの条件を達成しよう\n");
        }
        String displayUrl = getDisplayUrl();
        sb.append("詳細・報酬は" + (displayUrl.isBlank() ? "ブラウザ" : displayUrl) + " で確認");
        return sb.toString();
    }

    /** config の web-url から https:// / http:// を省いた表示用 URL を返す。*/
    private String getDisplayUrl() {
        String url = plugin.getConfig().getString("web-url", "");
        return url.replaceFirst("^https?://", "");
    }

    private void removeAdvancementSafe(NamespacedKey key) {
        try {
            Bukkit.getUnsafe().removeAdvancement(key);
        } catch (Exception e) {
            // 存在しない場合は無視
        }
    }

    private static String toMinecraftItem(String icon) {
        if (icon == null || icon.isBlank()) return "minecraft:map";
        if (icon.contains(":")) return icon;
        return "minecraft:" + icon.toLowerCase();
    }

    private static String sanitizeCriterionName(String condId) {
        return condId.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private NamespacedKey questKey(int questId) {
        return new NamespacedKey(NAMESPACE, "q" + questId);
    }

    private NamespacedKey rootKey() {
        return new NamespacedKey(NAMESPACE, "root");
    }
}
