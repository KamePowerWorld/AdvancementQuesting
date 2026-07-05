package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kamesuta.advquesting.util.NamespacedId;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * クエスト情報から Minecraft Advancement の JSON 文字列を生成する。
 * Bukkit への依存を持たない純粋なビルダークラス。
 */
public class AdvancementJsonBuilder {

    static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    private final QuestManager questManager;
    private final Supplier<String> displayUrlSupplier;

    /**
     * @param questManager       前提クエスト解決に使用する
     * @param displayUrlSupplier config の web-url 生値 (例: "https://example.com") を返す Supplier
     */
    public AdvancementJsonBuilder(QuestManager questManager, Supplier<String> displayUrlSupplier) {
        this.questManager = questManager;
        this.displayUrlSupplier = displayUrlSupplier;
    }

    /** root advancement の JSON を返す。 */
    public String buildRootJson() {
        return "{\"display\":{\"icon\":{\"id\":\"minecraft:writable_book\"},\"title\":{\"text\":\"クエスト\"}," +
               "\"description\":{\"text\":\"クエスト一覧\"}," +
               "\"background\":\"minecraft:block/smooth_stone\"," +
               "\"frame\":\"task\",\"show_toast\":false,\"announce_to_chat\":false}," +
               "\"criteria\":{\"root\":{\"trigger\":\"minecraft:impossible\"}}}";
    }

    /** 指定クエストの advancement JSON を返す。 */
    public String buildAdvancementJson(Quest quest) {
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

        // show_toast=true: クエスト完了時にトーストを表示する。
        // ログイン/リロード時の一括同期は reset パケットで送るためトーストは出ない（バニラ挙動）。
        return "{\"display\":{\"icon\":{\"id\":\"" + iconId + "\"}," +
               "\"title\":{\"text\":\"" + title + "\"}," +
               "\"description\":{\"text\":\"" + description + "\"}," +
               "\"frame\":\"task\",\"show_toast\":true,\"announce_to_chat\":false,\"hidden\":false}," +
               "\"parent\":\"" + parentKey + "\"," +
               "\"criteria\":{" + criteriaJson + "}," +
               "\"requirements\":[" + requirements + "]}";
    }

    /**
     * クエストの parent advancement key を解決する。
     * prerequisites があれば先頭の public クエストを親にし、なければ root を返す。
     */
    String resolveParentKey(Quest quest) {
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

    /** config の web-url から https:// / http:// を省いた表示用 URL を返す。 */
    private String getDisplayUrl() {
        String url = displayUrlSupplier.get();
        if (url == null) url = "";
        return url.replaceFirst("^https?://", "");
    }

    // ---- package-private static helpers (used by tests) ----

    static String toMinecraftItem(String icon) {
        if (icon == null || icon.isBlank()) return "minecraft:map";
        try {
            // 起動時マイグレーション後は常に完全形式 ("minecraft:xxx") のはず
            return NamespacedId.parse(icon).toString();
        } catch (IllegalArgumentException e) {
            // 不正なIDはデフォルトへフォールバック (省略形の補完はここでは行わない)
            return "minecraft:map";
        }
    }

    static String sanitizeCriterionName(String condId) {
        return condId.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    }

    static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    static Map<String, Boolean> parseProgress(String progressJson) {
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
}
