package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.util.NamespacedId;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * クエスト条件の純粋評価ロジック。
 * DAO・Bukkit・ProgressManager への依存を持たない。
 * 各 apply メソッドは渡された progress リストをインプレースで変更し、
 * 変更が発生した場合に {@code true} を返す。
 */
final class ConditionEvaluator {

    private ConditionEvaluator() {}

    // ---- アドバンスメント条件 ----

    /**
     * "advancement" または汎用アドバンスメントID 条件を評価し、完了済みエントリを progress に追加する。
     * <p>
     * NamespacedId としてパースして比較します。
     *
     * @param conditions クエスト条件リスト
     * @param progress   プレイヤー進捗リスト（インプレース変更）
     * @param condType   イベントの条件タイプ
     * @param condValue  イベントのアドバンスメントID
     * @return 少なくとも1件が変更された場合 {@code true}
     */
    static boolean applyAdvancement(
            List<Map<String, Object>> conditions,
            List<Map<String, Object>> progress,
            String condType,
            String condValue) {
        NamespacedId eventId = NamespacedId.parse(condValue);
        boolean changed = false;
        for (Map<String, Object> cond : conditions) {
            if (!condType.equals(cond.get("type"))) continue;
            if ("advancement".equals(condType)) {
                String condAdvId = (String) cond.get("advancementId");
                if (condAdvId == null) continue;
                NamespacedId condId = NamespacedId.parse(condAdvId);
                if (!eventId.equals(condId)) continue;
            } else {
                NamespacedId condId = NamespacedId.parse(condValue);
                NamespacedId condAdvId = NamespacedId.parse((String) cond.get("advancementId"));
                if (!condId.equals(condAdvId)) continue;
            }
            String condIdStr = (String) cond.get("id");
            boolean alreadyDone = progress.stream()
                    .anyMatch(p -> condIdStr.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (!alreadyDone) {
                progress.removeIf(p -> condIdStr.equals(p.get("conditionId")));
                progress.add(Map.of("conditionId", condIdStr, "completed", true));
                changed = true;
            }
        }
        return changed;
    }

    // ---- アイテム条件 ----

    /**
     * "item" 条件を評価し、インベントリ数が要求数以上であれば完了済みにする。
     * itemType は NamespacedId としてパースして比較します。
     *
     * @param conditions     クエスト条件リスト
     * @param progress       プレイヤー進捗リスト（インプレース変更）
     * @param itemType       イベントのアイテムタイプ
     * @param inventoryCount プレイヤーが所持している数
     * @return 少なくとも1件が変更された場合 {@code true}
     */
    static boolean applyItem(
            List<Map<String, Object>> conditions,
            List<Map<String, Object>> progress,
            String itemType,
            int inventoryCount) {
        NamespacedId eventId = NamespacedId.parse(itemType);
        boolean changed = false;
        for (Map<String, Object> cond : conditions) {
            if (!"item".equals(cond.get("type"))) continue;
            String condItemType = (String) cond.get("itemType");
            if (condItemType == null) continue;
            NamespacedId condId = NamespacedId.parse(condItemType);
            if (!eventId.equals(condId)) continue;
            String condIdStr = (String) cond.get("id");
            int required = ((Number) cond.getOrDefault("count", 1)).intValue();
            boolean wasCompleted = progress.stream()
                    .anyMatch(p -> condIdStr.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (wasCompleted) continue;
            if (inventoryCount < required) continue;
            progress.removeIf(p -> condIdStr.equals(p.get("conditionId")));
            progress.add(Map.of("conditionId", condIdStr, "completed", true));
            changed = true;
        }
        return changed;
    }

    // ---- 統計条件 ----

    /**
     * "stat" 条件を評価し、statType・statId が一致する条件の進捗を更新する。
     * baseValue/diff/cap ロジック、isRepeat 時の rawValue/baseValue フィールドを保持する。
     *
     * <p>繰り返し復活直後のエントリ ({@code rebase=true}) は、復活後最初のイベントの
     * previousValue を新しい baseValue とする。これによりクールダウン中の統計増分は
     * 次回クリアにカウントされない (例: 10killでクリア → クールダウン中に15まで増加 →
     * 復活後は15を基準に25で次のクリア)。
     *
     * @param conditions    クエスト条件リスト
     * @param progress      プレイヤー進捗リスト（インプレース変更）
     * @param statType      統計タイプ
     * @param statId        統計ID
     * @param currentValue  現在の統計値
     * @param previousValue 変化前の統計値
     * @param isRepeat      繰り返しクエストかどうか
     * @return 少なくとも1件が変更された場合 {@code true}
     */
    static boolean applyStat(
            List<Map<String, Object>> conditions,
            List<Map<String, Object>> progress,
            String statType,
            String statId,
            int currentValue,
            int previousValue,
            boolean isRepeat) {
        boolean changed = false;
        for (Map<String, Object> cond : conditions) {
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
            int baseValue;
            if (existing != null && Boolean.TRUE.equals(existing.get("rebase"))) {
                // 復活後最初のイベント: 直前値を基準にする (クールダウン中の増分を除外)
                baseValue = previousValue;
            } else {
                baseValue = existing != null && existing.get("baseValue") instanceof Number n ? n.intValue() : 0;
            }
            int diff = currentValue - baseValue;
            int capped = Math.min(diff, required);
            boolean nowDone = diff >= required;
            Map<String, Object> entry = new HashMap<>();
            entry.put("conditionId", condId);
            entry.put("current", capped);
            entry.put("required", required);
            entry.put("completed", nowDone);
            if (isRepeat) {
                entry.put("baseValue", baseValue);
                entry.put("rawValue", currentValue);
            }
            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(entry);
            changed = true;
        }
        return changed;
    }

    // ---- スコアボード条件 ----

    /**
     * "scoreboard" 条件を評価し、objective が一致する条件の進捗を更新する。
     * stat と同様の baseValue/diff/cap・isRepeat ロジックを持つが、
     * required のデフォルトキーが "score" である点が異なる。
     *
     * @param conditions クエスト条件リスト
     * @param progress   プレイヤー進捗リスト（インプレース変更）
     * @param objective  スコアボードオブジェクティブ名
     * @param score      現在のスコア
     * @param isRepeat   繰り返しクエストかどうか
     * @return 少なくとも1件が変更された場合 {@code true}
     */
    static boolean applyScoreboard(
            List<Map<String, Object>> conditions,
            List<Map<String, Object>> progress,
            String objective,
            int score,
            boolean isRepeat) {
        boolean changed = false;
        for (Map<String, Object> cond : conditions) {
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
            if (isRepeat) {
                entry.put("baseValue", baseValue);
                entry.put("rawValue", score);
            }
            progress.removeIf(p -> condId.equals(p.get("conditionId")));
            progress.add(entry);
            changed = true;
        }
        return changed;
    }

    // ---- ロケーション条件 ----

    /**
     * "location" 条件を評価し、プレイヤーが指定半径内にいれば完了済みにする。
     * 判定式: dx²+dz² &lt;= radius²（境界上は含む）。
     * dimension が一致しない場合はスキップ。デフォルト半径は 10。
     *
     * @param conditions クエスト条件リスト
     * @param progress   プレイヤー進捗リスト（インプレース変更）
     * @param px         プレイヤーX座標
     * @param py         プレイヤーY座標（未使用、将来拡張用）
     * @param pz         プレイヤーZ座標
     * @param dimension  プレイヤーのディメンション
     * @return 少なくとも1件が変更された場合 {@code true}
     */
    static boolean applyLocation(
            List<Map<String, Object>> conditions,
            List<Map<String, Object>> progress,
            int px,
            int py,
            int pz,
            String dimension) {
        boolean changed = false;
        for (Map<String, Object> cond : conditions) {
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
        return changed;
    }

    // ---- 納品 (delivery) ----

    /** 納品条件1件の必要量。 */
    record DeliveryNeed(String conditionId, NamespacedId itemType, int required, int alreadyDelivered) {
        int stillNeeded() {
            return required - alreadyDelivered;
        }
    }

    /**
     * 未完了の delivery 条件それぞれの必要量を計算する。
     * 完了済み・必要数を満たしている条件・id の無い条件は除外する。
     *
     * @param conditions クエスト条件リスト (delivery 以外が混ざっていてもよい)
     * @param progress   プレイヤー進捗リスト
     */
    static List<DeliveryNeed> computeDeliveryNeeds(
            List<Map<String, Object>> conditions,
            List<Map<String, Object>> progress) {
        List<DeliveryNeed> needs = new ArrayList<>();
        for (Map<String, Object> cond : conditions) {
            if (!"delivery".equals(cond.get("type"))) continue;
            String condId = (String) cond.get("id");
            if (condId == null) continue;
            boolean alreadyDone = progress.stream()
                    .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (alreadyDone) continue;

            String itemTypeStr = (String) cond.getOrDefault("itemType", "minecraft:stone");
            NamespacedId itemType = NamespacedId.parse(itemTypeStr);
            int required = ((Number) cond.getOrDefault("count", 1)).intValue();
            Map<String, Object> existing = progress.stream()
                    .filter(p -> condId.equals(p.get("conditionId")))
                    .findFirst().orElse(null);
            int alreadyDelivered = existing == null ? 0 : ((Number) existing.getOrDefault("current", 0)).intValue();
            if (required - alreadyDelivered <= 0) continue;
            needs.add(new DeliveryNeed(condId, itemType, required, alreadyDelivered));
        }
        return needs;
    }

    /**
     * 納品を進捗へ反映する（インプレース変更）。所持数と必要数の少ない方まで納品する。
     *
     * @param progress  プレイヤー進捗リスト（インプレース変更）
     * @param need      納品条件の必要量
     * @param haveCount プレイヤーの所持数 (1以上であること)
     * @return 消費した数
     */
    static int applyDelivery(List<Map<String, Object>> progress, DeliveryNeed need, int haveCount) {
        int toConsume = Math.min(haveCount, need.stillNeeded());
        int newTotal = need.alreadyDelivered() + toConsume;
        boolean nowDone = newTotal >= need.required();
        progress.removeIf(p -> need.conditionId().equals(p.get("conditionId")));
        progress.add(Map.of("conditionId", need.conditionId(), "current", newTotal,
                "required", need.required(), "completed", nowDone));
        return toConsume;
    }

    // ---- 達成判定 ----

    /**
     * checkmark/delivery を除く全条件が完了しているかを判定する。
     *
     * @param quest    クエスト定義
     * @param progress プレイヤー進捗リスト
     * @return 全条件（checkmark/delivery 除く）が完了していれば {@code true}
     */
    static boolean isAllConditionsMet(Quest quest, List<Map<String, Object>> progress) {
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

    /**
     * checkmark/delivery を含む全条件が完了しているかを判定する。
     *
     * @param quest    クエスト定義
     * @param progress プレイヤー進捗リスト
     * @return 全条件（checkmark/delivery 含む）が完了していれば {@code true}
     */
    static boolean isAllConditionsMetIncludingCheckmarks(Quest quest, List<Map<String, Object>> progress) {
        if (quest.conditions == null || quest.conditions.isEmpty()) return false;
        for (Map<String, Object> cond : quest.conditions) {
            String condId = (String) cond.get("id");
            boolean done = progress.stream()
                    .anyMatch(p -> condId.equals(p.get("conditionId")) && Boolean.TRUE.equals(p.get("completed")));
            if (!done) return false;
        }
        return true;
    }

    // ---- リセット進捗JSON生成 ----

    /**
     * 繰り返しリセット用の新しい進捗JSONを生成する。
     * stat/scoreboard 条件は前回クリア時の rawValue を新しい baseValue として引き継ぐ。
     * stat 条件はさらに rebase フラグを立て、復活後最初のイベントで
     * previousValue を基準値に採用する ({@link #applyStat} 参照)。
     *
     * @param quest             クエスト定義
     * @param completedProgress 完了時の進捗リスト
     * @return リセット後の進捗エントリリスト
     */
    static List<Map<String, Object>> buildResetProgressList(Quest quest, List<Map<String, Object>> completedProgress) {
        if (quest.conditions == null) return new ArrayList<>();
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
            if ("stat".equals(condType)) {
                entry.put("rebase", true);
            }
            newProgress.add(entry);
        }
        return newProgress;
    }
}
