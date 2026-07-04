package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.db.RewardClaimDao;
import com.kamesuta.advquesting.util.NamespacedId;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** RewardInterpreter の characterization テスト (旧 insertQuestRewards / giveRewards の解釈を固定)。 */
class RewardInterpreterTest {

    @Test
    void parseはtypeが無いとnullを返す() {
        assertNull(RewardInterpreter.parse(Map.of("count", 5)));
    }

    @Test
    void parseはitem報酬のitemTypeとcountを解釈する() {
        var p = RewardInterpreter.parse(Map.of("type", "item", "itemType", "minecraft:diamond", "count", 3));
        assertEquals("item", p.type());
        assertEquals(NamespacedId.parse("minecraft:diamond"), p.itemType());
        assertEquals(3, p.count());
        assertEquals(3, p.logAmount());
    }

    @Test
    void parseはitemTypeが無ければitemIdへフォールバックする() {
        var p = RewardInterpreter.parse(Map.of("type", "item", "itemId", "minecraft:gold_ingot"));
        assertEquals(NamespacedId.parse("minecraft:gold_ingot"), p.itemType());
        assertEquals(1, p.count()); // count デフォルト 1
    }

    @Test
    void parseはexperienceのamountを解釈しデフォルト0() {
        assertEquals(50, RewardInterpreter.parse(Map.of("type", "experience", "amount", 50)).amount());
        assertEquals(0, RewardInterpreter.parse(Map.of("type", "experience")).amount());
    }

    @Test
    void logAmountはcommand等で1を返す() {
        assertEquals(1, RewardInterpreter.parse(Map.of("type", "command", "command", "say hi")).logAmount());
        assertEquals(1, RewardInterpreter.parse(Map.of("type", "permission")).logAmount());
    }

    @Test
    void logAmountはpointでamountを返す() {
        assertEquals(10, RewardInterpreter.parse(Map.of("type", "point", "amount", 10)).logAmount());
    }

    @Test
    void toLogEntriesはtypeなし要素をスキップしitem以外のitemTypeをnullにする() {
        List<RewardClaimDao.LogEntry> entries = RewardInterpreter.toLogEntries(List.of(
            Map.of("type", "item", "itemType", "minecraft:diamond", "count", 2),
            Map.of("count", 9),                                  // type なし → スキップ
            Map.of("type", "experience", "amount", 30, "itemType", "junk")  // item 以外は itemType null
        ));
        assertEquals(2, entries.size());
        assertEquals(new RewardClaimDao.LogEntry("item", null, "minecraft:diamond", 2), entries.get(0));
        assertEquals(new RewardClaimDao.LogEntry("experience", null, null, 30), entries.get(1));
    }

    @Test
    void toLogEntriesはnullで空リストを返す() {
        assertEquals(List.of(), RewardInterpreter.toLogEntries(null));
    }

    @Test
    void toLogEntriesはlabelを保持する() {
        var entries = RewardInterpreter.toLogEntries(List.of(
            Map.of("type", "command", "command", "give", "label", "特別な何か")
        ));
        assertEquals(new RewardClaimDao.LogEntry("command", "特別な何か", null, 1), entries.get(0));
    }
}
