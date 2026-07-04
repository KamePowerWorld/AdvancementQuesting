package com.kamesuta.advquesting.data;

import java.util.List;
import java.util.Map;

/**
 * クエスト定義。JSON ファイルと 1:1 対応する。
 * Jackson でシリアライズ/デシリアライズする。
 *
 * <p>conditions / rewards は将来のフィールド追加を Web UI と非同期に行えるよう
 * 意図的に Map のまま保持する (正確な型は web/src/types/quest.ts の
 * Condition / Reward union が正)。Java 側での解釈は必ず以下に集約すること:
 * <ul>
 *   <li>条件の評価・進捗反映 → {@link ConditionEvaluator}</li>
 *   <li>報酬の解釈 → {@link RewardInterpreter}</li>
 * </ul>
 * 個々のルートやマネージャで {@code cond.get("...")} を直接書かないこと。
 *
 * <p>conditions 要素のスキーマ (type で分岐する discriminated union):
 * <pre>
 * 共通       : { id: string, type: string }
 * advancement: + { advancementId: "minecraft:story/mine_stone" }
 * item       : + { itemType: string, count?: int=1, nbt?: string, displayName?: string }
 * delivery   : + { itemType: string, count?: int=1, nbt?: string, displayName?: string }
 * checkmark  : + { label?: string }
 * stat       : + { statType: "minecraft:mined"等, statId: "minecraft:diamond"等, count: int }
 * location   : + { x: int, y: int, z: int, dimension: "overworld"|"nether"|"end", radius: int }
 * scoreboard : + { objective: string, score: int, label?: string }
 * </pre>
 *
 * <p>rewards 要素のスキーマ:
 * <pre>
 * item      : { type, itemId: string, count?: int=1, nbt?: string, displayName?: string }
 * experience: { type, amount: int, isLevel: boolean }
 * command   : { type, command: string, opLevel: int }
 * permission: { type, permission: string }
 * money     : { type, amount: int }
 * point     : { type, amount: int }
 * 共通       : label?: string (受取ログの表示名)
 * </pre>
 */
public class Quest {

    public int id;
    public String title;
    public String subtitle;
    public String description;
    public String icon;
    public String category;
    public List<Integer> prerequisites;
    public List<Map<String, Object>> conditions;
    public List<Map<String, Object>> rewards;
    public MapPosition mapPosition;
    public List<Map<String, Object>> customButtons;
    public String status;
    public String creatorUuid;
    public String creatorName;
    public String createdAt;
    public String updatedAt;
    /** 繰り返し設定 (null = なし) */
    public RepeatConfig repeat;

    public static class RepeatConfig {
        /** "none" | "cooldown" | "schedule" | "unlimited" */
        public String type;
        /** cooldown 用: 時間数 */
        public double cooldownHours;
        /** schedule 用: cron 式 "分 時 日 月 曜日" */
        public String cron;
    }

    public static class MapPosition {
        public double x;
        public double y;
    }
}
