package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.util.NamespacedId;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** {@link ConditionEvaluator} のキャラクタリゼーションテスト。 */
class ConditionEvaluatorTest {

    // ---- ヘルパー ----

    private static Quest makeQuest(List<Map<String, Object>> conditions) {
        Quest q = new Quest();
        q.conditions = conditions;
        return q;
    }

    private static Map<String, Object> cond(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static List<Map<String, Object>> emptyProgress() {
        return new ArrayList<>();
    }

    // ================================================================
    // applyItem
    // ================================================================

    @Test
    void applyItem_fullIdMatch() {
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "minecraft:stone", "count", 5));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "minecraft:stone", 5);
        assertTrue(changed);
        assertEquals(1, progress.size());
        assertTrue((Boolean) progress.get(0).get("completed"));
    }

    @Test
    void applyItem_shortFormThrows() {
        // 省略形はマイグレーション/TS側正規化済みが前提。Java側は厳密パースのみ
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "minecraft:stone", "count", 1));
        assertThrows(IllegalArgumentException.class,
                () -> ConditionEvaluator.applyItem(conditions, emptyProgress(), "stone", 1));
    }

    @Test
    void applyItem_defaultCountOne() {
        // count が指定されていない場合デフォルト 1
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "minecraft:stone"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "minecraft:stone", 1);
        assertTrue(changed);
    }

    @Test
    void applyItem_inventoryCountBelowRequired_noChange() {
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "minecraft:stone", "count", 10));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "minecraft:stone", 5);
        assertFalse(changed);
        assertTrue(progress.isEmpty());
    }

    @Test
    void applyItem_alreadyCompleted_noChange() {
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "minecraft:stone", "count", 1));
        var progress = new ArrayList<Map<String, Object>>();
        progress.add(new HashMap<>(Map.of("conditionId", "c1", "completed", true)));
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "minecraft:stone", 99);
        assertFalse(changed);
        assertEquals(1, progress.size());
    }

    // ================================================================
    // applyStat
    // ================================================================

    @Test
    void applyStat_basicProgress() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 10));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 7, 0, false);
        assertTrue(changed);
        Map<String, Object> entry = progress.get(0);
        assertEquals(7, entry.get("current"));
        assertEquals(10, entry.get("required"));
        assertEquals(false, entry.get("completed"));
        assertNull(entry.get("rawValue")); // isRepeat=false
    }

    @Test
    void applyStat_capAtRequired() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 10));
        var progress = emptyProgress();
        ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 20, 0, false);
        assertEquals(10, progress.get(0).get("current")); // capped
        assertEquals(true, progress.get(0).get("completed"));
    }

    @Test
    void applyStat_isRepeat_addsRawAndBaseValue() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 5));
        var progress = emptyProgress();
        ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 100, 0, true);
        Map<String, Object> entry = progress.get(0);
        assertNotNull(entry.get("rawValue"));
        assertNotNull(entry.get("baseValue"));
        assertEquals(100, entry.get("rawValue"));
        assertEquals(0, entry.get("baseValue"));
    }

    @Test
    void applyStat_nonRepeat_noRawOrBaseValue() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 5));
        var progress = emptyProgress();
        ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 100, 0, false);
        assertNull(progress.get(0).get("rawValue"));
        assertNull(progress.get(0).get("baseValue"));
    }

    @Test
    void applyStat_rebase_usesPreviousValueAsBase() {
        // 復活直後 (rebase=true): クールダウン中に 10→15 に増えていても、
        // 復活後最初のイベント (15→16) の previousValue=15 が新しい基準になる
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 10));
        var progress = new ArrayList<Map<String, Object>>();
        progress.add(new HashMap<>(Map.of(
                "conditionId", "c1", "current", 0, "required", 10,
                "baseValue", 10, "rawValue", 10, "completed", false, "rebase", true)));
        ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 16, 15, true);
        Map<String, Object> entry = progress.get(0);
        assertEquals(15, entry.get("baseValue")); // previousValue が採用される
        assertEquals(1, entry.get("current"));
        assertEquals(false, entry.get("completed"));
        assertNull(entry.get("rebase")); // フラグは消費される
        // その後 25 まで増えたらクリア (15→25 で 10)
        ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 25, 24, true);
        assertEquals(true, progress.get(0).get("completed"));
        assertEquals(10, progress.get(0).get("current"));
    }

    @Test
    void applyStat_noRebase_keepsExistingBaseValue() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 10));
        var progress = new ArrayList<Map<String, Object>>();
        progress.add(new HashMap<>(Map.of(
                "conditionId", "c1", "current", 0, "required", 10,
                "baseValue", 10, "rawValue", 10, "completed", false)));
        ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 16, 15, true);
        assertEquals(10, progress.get(0).get("baseValue")); // rebase なしなら据え置き
        assertEquals(6, progress.get(0).get("current"));
    }

    @Test
    void applyStat_wrongStatType_noChange() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 5));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyStat(conditions, progress, "OTHER", "mined", 10, 0, false);
        assertFalse(changed);
    }

    @Test
    void applyStat_wrongStatId_noChange() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 5));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyStat(conditions, progress, "custom", "OTHER", 10, 0, false);
        assertFalse(changed);
    }

    // ================================================================
    // applyScoreboard
    // ================================================================

    @Test
    void applyScoreboard_defaultScore() {
        // score が指定されていない場合デフォルト 1
        var conditions = List.of(cond("type", "scoreboard", "id", "c1", "objective", "kills"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyScoreboard(conditions, progress, "kills", 1, false);
        assertTrue(changed);
        assertEquals(true, progress.get(0).get("completed"));
    }

    @Test
    void applyScoreboard_isRepeat_addsRawAndBaseValue() {
        var conditions = List.of(cond("type", "scoreboard", "id", "c1", "objective", "kills", "score", 5));
        var progress = emptyProgress();
        ConditionEvaluator.applyScoreboard(conditions, progress, "kills", 10, true);
        Map<String, Object> entry = progress.get(0);
        assertEquals(10, entry.get("rawValue"));
        assertEquals(0, entry.get("baseValue"));
    }

    @Test
    void applyScoreboard_wrongObjective_noChange() {
        var conditions = List.of(cond("type", "scoreboard", "id", "c1", "objective", "kills", "score", 5));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyScoreboard(conditions, progress, "deaths", 10, false);
        assertFalse(changed);
    }

    // ================================================================
    // applyLocation
    // ================================================================

    @Test
    void applyLocation_insideRadius_changed() {
        var conditions = List.of(cond("type", "location", "id", "c1", "x", 0, "z", 0, "radius", 10, "dimension", "overworld"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyLocation(conditions, progress, 5, 64, 5, "overworld");
        assertTrue(changed);
    }

    @Test
    void applyLocation_exactlyOnBoundary_included() {
        // dx²+dz² == radius² は含む (> ではなく <=)
        var conditions = List.of(cond("type", "location", "id", "c1", "x", 0, "z", 0, "radius", 10, "dimension", "overworld"));
        var progress = emptyProgress();
        // dx=6, dz=8 → 36+64=100=10² (on boundary)
        boolean changed = ConditionEvaluator.applyLocation(conditions, progress, 6, 64, 8, "overworld");
        assertTrue(changed);
    }

    @Test
    void applyLocation_outsideRadius_noChange() {
        var conditions = List.of(cond("type", "location", "id", "c1", "x", 0, "z", 0, "radius", 10, "dimension", "overworld"));
        var progress = emptyProgress();
        // dx=7, dz=8 → 49+64=113 > 100
        boolean changed = ConditionEvaluator.applyLocation(conditions, progress, 7, 64, 8, "overworld");
        assertFalse(changed);
    }

    @Test
    void applyLocation_defaultRadius() {
        // radius 指定なし → デフォルト 10
        var conditions = List.of(cond("type", "location", "id", "c1", "x", 0, "z", 0, "dimension", "overworld"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyLocation(conditions, progress, 10, 64, 0, "overworld");
        assertTrue(changed); // dx=10,dz=0 → 100 == 100 (boundary included)
    }

    @Test
    void applyLocation_wrongDimension_noChange() {
        var conditions = List.of(cond("type", "location", "id", "c1", "x", 0, "z", 0, "radius", 10, "dimension", "overworld"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyLocation(conditions, progress, 0, 64, 0, "nether");
        assertFalse(changed);
    }

    // ================================================================
    // applyAdvancement
    // ================================================================

    @Test
    void applyAdvancement_fullIdMatch() {
        var conditions = List.of(cond("type", "advancement", "id", "c1", "advancementId", "minecraft:story/mine_stone"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyAdvancement(conditions, progress, "advancement", "minecraft:story/mine_stone");
        assertTrue(changed);
    }

    @Test
    void applyAdvancement_shortFormThrows() {
        // 省略形はマイグレーション/TS側正規化済みが前提。Java側は厳密パースのみ
        var conditions = List.of(cond("type", "advancement", "id", "c1", "advancementId", "minecraft:story/mine_stone"));
        assertThrows(IllegalArgumentException.class,
                () -> ConditionEvaluator.applyAdvancement(conditions, emptyProgress(), "advancement", "story/mine_stone"));
    }

    @Test
    void applyAdvancement_mismatch_noChange() {
        var conditions = List.of(cond("type", "advancement", "id", "c1", "advancementId", "minecraft:story/other"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyAdvancement(conditions, progress, "advancement", "minecraft:story/mine_stone");
        assertFalse(changed);
    }

    // ================================================================
    // isAllConditionsMetIncludingCheckmarks
    // ================================================================

    @Test
    void isAllConditionsMetIncludingCheckmarks_statDoneButDeliveryPending_returnsFalse() {
        // 統計タスク + 納品タスク2つ。統計だけ完了しても納品が残っていれば未完了。
        Quest quest = makeQuest(List.of(
                cond("type", "stat", "id", "c1"),
                cond("type", "delivery", "id", "c2"),
                cond("type", "delivery", "id", "c3")
        ));
        var progress = new ArrayList<Map<String, Object>>();
        progress.add(Map.of("conditionId", "c1", "completed", true));
        assertFalse(ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, progress));

        // 両方の納品を完了すると true
        progress.add(Map.of("conditionId", "c2", "completed", true));
        progress.add(Map.of("conditionId", "c3", "completed", true));
        assertTrue(ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, progress));
    }

    @Test
    void isAllConditionsMetIncludingCheckmarks_itemNotDone_returnsFalse() {
        Quest quest = makeQuest(List.of(cond("type", "item", "id", "c1")));
        assertFalse(ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, emptyProgress()));
    }

    @Test
    void isAllConditionsMetIncludingCheckmarks_requiresCheckmark() {
        Quest quest = makeQuest(List.of(
                cond("type", "checkmark", "id", "c1"),
                cond("type", "item", "id", "c2")
        ));
        var progress = new ArrayList<Map<String, Object>>();
        progress.add(Map.of("conditionId", "c2", "completed", true));
        // c1 が未完了なので false
        assertFalse(ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, progress));

        progress.add(Map.of("conditionId", "c1", "completed", true));
        assertTrue(ConditionEvaluator.isAllConditionsMetIncludingCheckmarks(quest, progress));
    }

    // ================================================================
    // buildResetProgressList
    // ================================================================

    @Test
    void buildResetProgressList_statCarriesRawValueAsBaseValue() {
        Quest quest = makeQuest(List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 10)));
        var completedProgress = List.<Map<String, Object>>of(
                new HashMap<>(Map.of("conditionId", "c1", "completed", true, "rawValue", 500))
        );
        List<Map<String, Object>> result = ConditionEvaluator.buildResetProgressList(quest, completedProgress);
        assertEquals(1, result.size());
        assertEquals(500, result.get(0).get("baseValue"));
        assertEquals(500, result.get(0).get("rawValue"));
        assertEquals(false, result.get(0).get("completed"));
        assertEquals(0, result.get(0).get("current"));
        assertEquals(true, result.get(0).get("rebase")); // 復活後最初のイベントで基準値を再設定
    }

    @Test
    void buildResetProgressList_scoreboardCarriesRawValue() {
        Quest quest = makeQuest(List.of(cond("type", "scoreboard", "id", "c1", "objective", "kills", "score", 5)));
        var completedProgress = List.<Map<String, Object>>of(
                new HashMap<>(Map.of("conditionId", "c1", "completed", true, "rawValue", 200))
        );
        List<Map<String, Object>> result = ConditionEvaluator.buildResetProgressList(quest, completedProgress);
        assertEquals(1, result.size());
        assertEquals(200, result.get(0).get("baseValue"));
    }

    @Test
    void buildResetProgressList_itemAndOtherTypesOmitted() {
        Quest quest = makeQuest(List.of(
                cond("type", "item", "id", "c1", "itemType", "minecraft:stone"),
                cond("type", "advancement", "id", "c2", "advancementId", "something"),
                cond("type", "stat", "id", "c3", "statType", "custom", "statId", "mined", "count", 1)
        ));
        var completedProgress = emptyProgress();
        List<Map<String, Object>> result = ConditionEvaluator.buildResetProgressList(quest, completedProgress);
        // item と advancement は含まれない
        assertEquals(1, result.size());
        assertEquals("c3", result.get(0).get("conditionId"));
    }

    // ---- computeDeliveryNeeds / applyDelivery ----

    @Test
    void computeDeliveryNeeds_未納品のdelivery条件を返す() {
        var conditions = List.of(
                cond("type", "delivery", "id", "d1", "itemType", "minecraft:iron_ingot", "count", 5),
                cond("type", "item", "id", "c1", "itemType", "minecraft:stone")  // delivery 以外は除外
        );
        var needs = ConditionEvaluator.computeDeliveryNeeds(conditions, emptyProgress());
        assertEquals(1, needs.size());
        assertEquals("d1", needs.get(0).conditionId());
        assertEquals(NamespacedId.parse("minecraft:iron_ingot"), needs.get(0).itemType());
        assertEquals(5, needs.get(0).required());
        assertEquals(0, needs.get(0).alreadyDelivered());
        assertEquals(5, needs.get(0).stillNeeded());
    }

    @Test
    void computeDeliveryNeeds_デフォルトはminecraft_stoneと1個() {
        var conditions = List.of(cond("type", "delivery", "id", "d1"));
        var needs = ConditionEvaluator.computeDeliveryNeeds(conditions, emptyProgress());
        assertEquals(NamespacedId.parse("minecraft:stone"), needs.get(0).itemType());
        assertEquals(1, needs.get(0).required());
    }

    @Test
    void computeDeliveryNeeds_完了済みとidなしは除外する() {
        var conditions = List.of(
                cond("type", "delivery", "id", "d1", "count", 3),
                cond("type", "delivery", "count", 3)  // id なし
        );
        var progress = List.<Map<String, Object>>of(
                new HashMap<>(Map.of("conditionId", "d1", "completed", true))
        );
        assertEquals(0, ConditionEvaluator.computeDeliveryNeeds(conditions, progress).size());
    }

    @Test
    void computeDeliveryNeeds_部分納品済みの残数を返す() {
        var conditions = List.of(cond("type", "delivery", "id", "d1", "count", 10));
        var progress = List.<Map<String, Object>>of(
                new HashMap<>(Map.of("conditionId", "d1", "current", 4, "required", 10, "completed", false))
        );
        var needs = ConditionEvaluator.computeDeliveryNeeds(conditions, progress);
        assertEquals(4, needs.get(0).alreadyDelivered());
        assertEquals(6, needs.get(0).stillNeeded());
    }

    @Test
    void applyDelivery_所持数が足りれば完了になる() {
        var progress = emptyProgress();
        var need = new ConditionEvaluator.DeliveryNeed("d1", NamespacedId.parse("minecraft:stone"), 5, 0);
        int consumed = ConditionEvaluator.applyDelivery(progress, need, 8);
        assertEquals(5, consumed);
        assertEquals(1, progress.size());
        assertEquals(5, progress.get(0).get("current"));
        assertEquals(true, progress.get(0).get("completed"));
    }

    @Test
    void applyDelivery_所持数不足なら部分納品で未完了() {
        var progress = emptyProgress();
        var need = new ConditionEvaluator.DeliveryNeed("d1", NamespacedId.parse("minecraft:stone"), 5, 2);
        int consumed = ConditionEvaluator.applyDelivery(progress, need, 1);
        assertEquals(1, consumed);
        assertEquals(3, progress.get(0).get("current"));
        assertEquals(false, progress.get(0).get("completed"));
        assertEquals(5, progress.get(0).get("required"));
    }

    @Test
    void applyDelivery_既存の進捗行を置き換える() {
        var progress = new java.util.ArrayList<Map<String, Object>>();
        progress.add(new HashMap<>(Map.of("conditionId", "d1", "current", 2, "required", 5, "completed", false)));
        var need = new ConditionEvaluator.DeliveryNeed("d1", NamespacedId.parse("minecraft:stone"), 5, 2);
        ConditionEvaluator.applyDelivery(progress, need, 100);
        assertEquals(1, progress.size());
        assertEquals(5, progress.get(0).get("current"));
    }
}
