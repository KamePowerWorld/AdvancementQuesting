package com.kamesuta.advquesting.db;

import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.IntFunction;

/**
 * 報酬受取ログ (reward_claims) の DAO。
 * 報酬1項目=1レコードで追記し、トータル獲得報酬を集計する。
 */
public class RewardClaimDao extends BaseDao {

    /** 受取明細1行。 */
    public record ClaimRow(
        long id,
        int questId,
        String questTitle,
        String rewardType,
        String rewardLabel,
        String itemType,
        long amount,
        String claimedAt
    ) {}

    /** 移行対象1行 (migrateFromProgress 用)。 */
    private record MigrationTarget(String playerUuid, int questId, String completedAt) {}

    public RewardClaimDao(DatabaseManager db) {
        super(db);
    }

    /** 報酬1項目を追記する。 */
    public void insert(String playerUuid, String playerName, int questId, String questTitle,
                       String rewardType, String rewardLabel, String itemType, long amount,
                       String claimedAt, String source) throws SQLException {
        update("""
            INSERT INTO reward_claims
              (player_uuid, player_name, quest_id, quest_title, reward_type, reward_label, item_type, amount, claimed_at, source)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            """, playerUuid, playerName, questId, questTitle, rewardType, rewardLabel, itemType, amount, claimedAt, source);
    }

    /**
     * 1クエスト分の報酬 (rewards 配列) をまとめて追記する。
     * giveRewards と同じ解釈で type/label/amount/itemType を抽出する。
     */
    public void insertQuestRewards(String playerUuid, String playerName, int questId, String questTitle,
                                   List<Map<String, Object>> rewards, String claimedAt, String source) throws SQLException {
        if (rewards == null) return;
        for (Map<String, Object> reward : rewards) {
            String type = (String) reward.get("type");
            if (type == null) continue;
            String label = reward.get("label") instanceof String s ? s : null;
            String itemType = null;
            long amount = 1;
            if ("item".equals(type)) {
                Object it = reward.getOrDefault("itemType", reward.get("itemId"));
                itemType = it instanceof String s ? s : null;
                amount = ((Number) reward.getOrDefault("count", 1)).longValue();
            } else if ("experience".equals(type) || "point".equals(type)) {
                amount = ((Number) reward.getOrDefault("amount", 0)).longValue();
            } else {
                // command 等は実行回数として 1
                amount = 1;
            }
            insert(playerUuid, playerName, questId, questTitle, type, label, itemType, amount, claimedAt, source);
        }
    }

    /** 指定プレイヤーの全受取明細を新しい順で返す。 */
    public List<ClaimRow> byPlayer(String playerUuid) throws SQLException {
        return queryList("""
            SELECT id, quest_id, quest_title, reward_type, reward_label, item_type, amount, claimed_at
            FROM reward_claims
            WHERE player_uuid = ?
            ORDER BY id DESC
            """,
            rs -> new ClaimRow(
                rs.getLong("id"),
                rs.getInt("quest_id"),
                rs.getString("quest_title"),
                rs.getString("reward_type"),
                rs.getString("reward_label"),
                rs.getString("item_type"),
                rs.getLong("amount"),
                rs.getString("claimed_at")
            ), playerUuid);
    }

    /** 指定プレイヤーの type別 amount 合計を返す (totalsByType)。 */
    public Map<String, Long> totalsByType(String playerUuid) throws SQLException {
        Map<String, Long> totals = new LinkedHashMap<>();
        queryList("SELECT reward_type, SUM(amount) AS total FROM reward_claims WHERE player_uuid = ? GROUP BY reward_type",
            rs -> totals.put(rs.getString("reward_type"), rs.getLong("total")), playerUuid);
        return totals;
    }

    /**
     * 既存の player_progress (completed=1 AND reward_claimed=1) を「受取済み」とみなして
     * reward_claims に遡及移行する。各クエストの rewards を rewardsResolver で取得して展開する。
     *
     * - 初回1回ぶんのみ (過去の周回数は復元不可)。
     * - source='migrated' の既存レコードがある (player_uuid, quest_id) はスキップ (冪等)。
     *
     * @param rewardsResolver questId → そのクエストの (title, rewards)。null を返したらスキップ。
     * @param nameResolver    uuid → 表示名。null/失敗時は uuid を使う。
     * @return 移行したクエスト数
     */
    public int migrateFromProgress(
            IntFunction<QuestRewards> rewardsResolver,
            Function<String, String> nameResolver) throws SQLException {
        // 取得した行を先に集めてから挿入する (同一 Statement の ResultSet を開いたまま insert しないため)
        List<MigrationTarget> targets = queryList("""
            SELECT pp.player_uuid AS uuid, pp.quest_id AS qid, pp.completed_at AS cat
            FROM player_progress pp
            WHERE pp.completed = 1 AND pp.reward_claimed = 1
              AND NOT EXISTS (
                  SELECT 1 FROM reward_claims rc
                  WHERE rc.player_uuid = pp.player_uuid AND rc.quest_id = pp.quest_id AND rc.source = 'migrated'
              )
            """,
            rs -> new MigrationTarget(rs.getString("uuid"), rs.getInt("qid"), rs.getString("cat")));

        int migrated = 0;
        for (MigrationTarget t : targets) {
            String claimedAt = (t.completedAt() == null || t.completedAt().isEmpty())
                ? Instant.now().toString() : t.completedAt();
            QuestRewards qr = rewardsResolver.apply(t.questId());
            if (qr == null || qr.rewards() == null || qr.rewards().isEmpty()) continue; // 解決不可・報酬なしはスキップ
            String name = t.playerUuid();
            if (nameResolver != null) {
                try {
                    String resolved = nameResolver.apply(t.playerUuid());
                    if (resolved != null && !resolved.isEmpty()) name = resolved;
                } catch (Exception ignored) {}
            }
            insertQuestRewards(t.playerUuid(), name, t.questId(), qr.title(), qr.rewards(), claimedAt, "migrated");
            migrated++;
        }
        return migrated;
    }

    /** 移行時に解決するクエストのタイトルと報酬。 */
    public record QuestRewards(String title, List<Map<String, Object>> rewards) {}
}
