package com.kamesuta.advquesting.data;

import com.kamesuta.advquesting.db.RewardClaimDao;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 報酬マップ (クエスト JSON の rewards 要素) の解釈を一元化する。純ロジック (Bukkit 非依存)。
 * 報酬付与 (RewardManager) と受取ログ (RewardClaimDao) で解釈を一致させるための単一実装。
 */
public final class RewardInterpreter {

    private RewardInterpreter() {}

    /** 解釈済み報酬。type が無い報酬は parse が null を返す。 */
    public record ParsedReward(String type, String label, String itemType, int count, int amount, String nbt, String command) {

        /** 受取ログ用の集計量: item→count, experience/point→amount, その他 (command等)→実行回数として1 */
        public long logAmount() {
            if ("item".equals(type)) return count;
            if ("experience".equals(type) || "point".equals(type)) return amount;
            return 1;
        }
    }

    /** 報酬マップを解釈する。type が無ければ null。 */
    public static ParsedReward parse(Map<String, Object> reward) {
        String type = (String) reward.get("type");
        if (type == null) return null;
        String label = reward.get("label") instanceof String s ? s : null;
        Object it = reward.getOrDefault("itemType", reward.get("itemId"));
        String itemType = it instanceof String s ? s : null;
        int count = ((Number) reward.getOrDefault("count", 1)).intValue();
        int amount = ((Number) reward.getOrDefault("amount", 0)).intValue();
        String nbt = reward.get("nbt") instanceof String s ? s : null;
        String command = reward.get("command") instanceof String s ? s : null;
        return new ParsedReward(type, label, itemType, count, amount, nbt, command);
    }

    /** rewards 配列を受取ログ行へ変換する。type の無い要素はスキップ。 */
    public static List<RewardClaimDao.LogEntry> toLogEntries(List<Map<String, Object>> rewards) {
        List<RewardClaimDao.LogEntry> entries = new ArrayList<>();
        if (rewards == null) return entries;
        for (Map<String, Object> reward : rewards) {
            ParsedReward p = parse(reward);
            if (p == null) continue;
            String itemType = "item".equals(p.type()) ? p.itemType() : null;
            entries.add(new RewardClaimDao.LogEntry(p.type(), p.label(), itemType, p.logAmount()));
        }
        return entries;
    }
}
