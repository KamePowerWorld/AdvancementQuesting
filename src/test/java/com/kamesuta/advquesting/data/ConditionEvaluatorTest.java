package com.kamesuta.advquesting.data;

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
    void applyItem_namespaceStrippedBothSides() {
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "minecraft:stone", "count", 5));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "minecraft:stone", 5);
        assertTrue(changed);
        assertEquals(1, progress.size());
        assertTrue((Boolean) progress.get(0).get("completed"));
    }

    @Test
    void applyItem_namespaceStripOnEventSide() {
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "stone", "count", 1));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "minecraft:stone", 1);
        assertTrue(changed);
    }

    @Test
    void applyItem_namespaceStripOnConditionSide() {
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "minecraft:stone", "count", 1));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "stone", 1);
        assertTrue(changed);
    }

    @Test
    void applyItem_defaultCountOne() {
        // count が指定されていない場合デフォルト 1
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "stone"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "stone", 1);
        assertTrue(changed);
    }

    @Test
    void applyItem_inventoryCountBelowRequired_noChange() {
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "stone", "count", 10));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "stone", 5);
        assertFalse(changed);
        assertTrue(progress.isEmpty());
    }

    @Test
    void applyItem_alreadyCompleted_noChange() {
        var conditions = List.of(cond("type", "item", "id", "c1", "itemType", "stone", "count", 1));
        var progress = new ArrayList<Map<String, Object>>();
        progress.add(new HashMap<>(Map.of("conditionId", "c1", "completed", true)));
        boolean changed = ConditionEvaluator.applyItem(conditions, progress, "stone", 99);
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
        boolean changed = ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 7, false);
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
        ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 20, false);
        assertEquals(10, progress.get(0).get("current")); // capped
        assertEquals(true, progress.get(0).get("completed"));
    }

    @Test
    void applyStat_isRepeat_addsRawAndBaseValue() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 5));
        var progress = emptyProgress();
        ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 100, true);
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
        ConditionEvaluator.applyStat(conditions, progress, "custom", "mined", 100, false);
        assertNull(progress.get(0).get("rawValue"));
        assertNull(progress.get(0).get("baseValue"));
    }

    @Test
    void applyStat_wrongStatType_noChange() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 5));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyStat(conditions, progress, "OTHER", "mined", 10, false);
        assertFalse(changed);
    }

    @Test
    void applyStat_wrongStatId_noChange() {
        var conditions = List.of(cond("type", "stat", "id", "c1", "statType", "custom", "statId", "mined", "count", 5));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyStat(conditions, progress, "custom", "OTHER", 10, false);
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
    void applyAdvancement_namespaceStrippedMatch() {
        var conditions = List.of(cond("type", "advancement", "id", "c1", "advancementId", "minecraft:story/mine_stone"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyAdvancement(conditions, progress, "advancement", "story/mine_stone");
        assertTrue(changed);
    }

    @Test
    void applyAdvancement_noNamespaceInCondition() {
        var conditions = List.of(cond("type", "advancement", "id", "c1", "advancementId", "story/mine_stone"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyAdvancement(conditions, progress, "advancement", "story/mine_stone");
        assertTrue(changed);
    }

    @Test
    void applyAdvancement_mismatch_noChange() {
        var conditions = List.of(cond("type", "advancement", "id", "c1", "advancementId", "minecraft:story/other"));
        var progress = emptyProgress();
        boolean changed = ConditionEvaluator.applyAdvancement(conditions, progress, "advancement", "story/mine_stone");
        assertFalse(changed);
    }

    // ================================================================
    // isAllConditionsMet
    // ================================================================

    @Test
    void isAllConditionsMet_skipsCheckmarkAndDelivery() {
        Quest quest = makeQuest(List.of(
                cond("type", "checkmark", "id", "c1"),
                cond("type", "delivery", "id", "c2"),
                cond("type", "item", "id", "c3")
        ));
        var progress = new ArrayList<Map<String, Object>>();
        progress.add(Map.of("conditionId", "c3", "completed", true));
        // c1/c2 は進捗なしでも true になるはず
        assertTrue(ConditionEvaluator.isAllConditionsMet(quest, progress));
    }

    @Test
    void isAllConditionsMet_itemNotDone_returnsFalse() {
        Quest quest = makeQuest(List.of(cond("type", "item", "id", "c1")));
        assertTrue(!ConditionEvaluator.isAllConditionsMet(quest, emptyProgress()));
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
                cond("type", "item", "id", "c1", "itemType", "stone"),
                cond("type", "advancement", "id", "c2", "advancementId", "something"),
                cond("type", "stat", "id", "c3", "statType", "custom", "statId", "mined", "count", 1)
        ));
        var completedProgress = emptyProgress();
        List<Map<String, Object>> result = ConditionEvaluator.buildResetProgressList(quest, completedProgress);
        // item と advancement は含まれない
        assertEquals(1, result.size());
        assertEquals("c3", result.get(0).get("conditionId"));
    }
}
