package com.kamesuta.advquesting.db;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/** 全体統計 (leaderboard / timeseries / rewards / quests / activity / all-rewards) の DAO。 */
public class StatsDao {

    public record LeaderboardEntry(String playerUuid, String playerName, long value) {}
    public record TimeseriesPoint(String date, long value) {}
    public record RewardAggEntry(String rewardType, String rewardLabel, long totalAmount, long claimCount) {}
    public record QuestStatEntry(int questId, long completionCount, long uniquePlayers) {}

    /** rewards_raw は "|" 区切りの "type:itemType:amount:label" リスト (各フィールドは空文字の可能性あり) */
    public record GlobalActivityRow(long id, String playerUuid, String playerName, int questId, String completedAt, String rewardsRaw) {}

    public record GlobalActivityPage(List<GlobalActivityRow> items, Long nextCursor) {}

    public record AllRewardsEntry(String rewardType, String itemType, String rewardLabel, long totalAmount) {}
    public record AllRewardsPlayer(String playerUuid, String playerName, long totalAmount) {}
    public record AllRewardsQuest(int questId, String questTitle, long totalAmount) {}

    private final DatabaseManager db;

    public StatsDao(DatabaseManager db) {
        this.db = db;
    }

    public List<LeaderboardEntry> leaderboardByPoints(int limit) throws SQLException {
        String sql = """
            SELECT player_uuid, MAX(player_name) AS player_name, SUM(amount) AS total
            FROM reward_claims
            WHERE reward_type = 'point'
            GROUP BY player_uuid
            ORDER BY total DESC
            LIMIT ?
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setInt(1, limit);
            ResultSet rs = ps.executeQuery();
            List<LeaderboardEntry> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new LeaderboardEntry(rs.getString("player_uuid"), rs.getString("player_name"), rs.getLong("total")));
            }
            return rows;
        }
    }

    public List<LeaderboardEntry> leaderboardByCompletions(int limit) throws SQLException {
        String sql = """
            SELECT player_uuid, MAX(player_name) AS player_name, COUNT(*) AS total
            FROM quest_completions
            GROUP BY player_uuid
            ORDER BY total DESC
            LIMIT ?
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setInt(1, limit);
            ResultSet rs = ps.executeQuery();
            List<LeaderboardEntry> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new LeaderboardEntry(rs.getString("player_uuid"), rs.getString("player_name"), rs.getLong("total")));
            }
            return rows;
        }
    }

    public List<TimeseriesPoint> timeseriesCompletions(int days) throws SQLException {
        String sql = """
            SELECT strftime('%Y-%m-%d', completed_at) AS date, COUNT(*) AS value
            FROM quest_completions
            WHERE completed_at >= datetime('now', '-' || ? || ' days')
            GROUP BY date
            ORDER BY date ASC
            """;
        return queryTimeseries(sql, days);
    }

    public List<TimeseriesPoint> timeseriesPoints(int days) throws SQLException {
        String sql = """
            SELECT strftime('%Y-%m-%d', claimed_at) AS date, SUM(amount) AS value
            FROM reward_claims
            WHERE reward_type = 'point'
              AND claimed_at >= datetime('now', '-' || ? || ' days')
            GROUP BY date
            ORDER BY date ASC
            """;
        return queryTimeseries(sql, days);
    }

    private List<TimeseriesPoint> queryTimeseries(String sql, int days) throws SQLException {
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setInt(1, days);
            ResultSet rs = ps.executeQuery();
            List<TimeseriesPoint> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new TimeseriesPoint(rs.getString("date"), rs.getLong("value")));
            }
            return rows;
        }
    }

    public List<RewardAggEntry> rewardsAggregated(int limit) throws SQLException {
        String sql = """
            SELECT reward_type, reward_label, SUM(amount) AS total_amount, COUNT(*) AS claim_count
            FROM reward_claims
            GROUP BY reward_type, reward_label
            ORDER BY total_amount DESC
            LIMIT ?
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setInt(1, limit);
            ResultSet rs = ps.executeQuery();
            List<RewardAggEntry> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new RewardAggEntry(rs.getString("reward_type"), rs.getString("reward_label"), rs.getLong("total_amount"), rs.getLong("claim_count")));
            }
            return rows;
        }
    }

    public List<QuestStatEntry> questStatsByPopularity(int limit) throws SQLException {
        return questStats("DESC", limit);
    }

    public List<QuestStatEntry> questStatsByHardest(int limit) throws SQLException {
        return questStats("ASC", limit);
    }

    private List<QuestStatEntry> questStats(String order, int limit) throws SQLException {
        String sql = """
            SELECT quest_id, COUNT(*) AS completion_count, COUNT(DISTINCT player_uuid) AS unique_players
            FROM quest_completions
            GROUP BY quest_id
            ORDER BY unique_players %s, completion_count %s
            LIMIT ?
            """.formatted(order, order);
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setInt(1, limit);
            ResultSet rs = ps.executeQuery();
            List<QuestStatEntry> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new QuestStatEntry(rs.getInt("quest_id"), rs.getLong("completion_count"), rs.getLong("unique_players")));
            }
            return rows;
        }
    }

    /** カーソルベースのページネーション。before=null の場合は最新から取得。 */
    public GlobalActivityPage globalActivityPage(int limit, Long before) throws SQLException {
        String whereClause = before != null ? "WHERE qc.id < ?" : "";
        String sql = """
            SELECT
              qc.id,
              qc.player_uuid,
              qc.player_name,
              qc.quest_id,
              qc.completed_at,
              GROUP_CONCAT(
                rc.reward_type || ':' || COALESCE(rc.item_type, '') || ':' || rc.amount || ':' || COALESCE(rc.reward_label, ''),
                '|'
              ) AS rewards_raw
            FROM quest_completions qc
            LEFT JOIN reward_claims rc ON rc.quest_id = qc.quest_id AND rc.player_uuid = qc.player_uuid
            %s
            GROUP BY qc.id
            ORDER BY qc.id DESC
            LIMIT ?
            """.formatted(whereClause);

        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            int paramIdx = 1;
            if (before != null) ps.setLong(paramIdx++, before);
            ps.setInt(paramIdx, limit + 1);

            ResultSet rs = ps.executeQuery();
            List<GlobalActivityRow> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new GlobalActivityRow(
                    rs.getLong("id"),
                    rs.getString("player_uuid"),
                    rs.getString("player_name"),
                    rs.getInt("quest_id"),
                    rs.getString("completed_at"),
                    rs.getString("rewards_raw")
                ));
            }

            boolean hasMore = rows.size() > limit;
            List<GlobalActivityRow> items = hasMore ? rows.subList(0, limit) : rows;
            Long nextCursor = hasMore ? items.get(items.size() - 1).id() : null;
            return new GlobalActivityPage(new ArrayList<>(items), nextCursor);
        }
    }

    public List<AllRewardsEntry> allRewards() throws SQLException {
        String sql = """
            SELECT
              reward_type,
              item_type,
              MAX(reward_label) AS reward_label,
              SUM(amount) AS total_amount
            FROM reward_claims
            GROUP BY reward_type, COALESCE(item_type, '__none__')
            ORDER BY total_amount DESC
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ResultSet rs = ps.executeQuery();
            List<AllRewardsEntry> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new AllRewardsEntry(
                    rs.getString("reward_type"),
                    rs.getString("item_type"),
                    rs.getString("reward_label"),
                    rs.getLong("total_amount")
                ));
            }
            return rows;
        }
    }

    public List<AllRewardsPlayer> allRewardsDetailPlayers(String rewardType, String itemType) throws SQLException {
        String itemCondition = itemType != null
            ? "AND COALESCE(item_type, '__none__') = COALESCE(?, '__none__')"
            : "AND item_type IS NULL";
        String sql = """
            SELECT player_uuid, MAX(player_name) AS player_name, SUM(amount) AS total_amount
            FROM reward_claims
            WHERE reward_type = ? %s
            GROUP BY player_uuid
            ORDER BY total_amount DESC
            LIMIT 30
            """.formatted(itemCondition);
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, rewardType);
            if (itemType != null) ps.setString(2, itemType);
            ResultSet rs = ps.executeQuery();
            List<AllRewardsPlayer> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new AllRewardsPlayer(rs.getString("player_uuid"), rs.getString("player_name"), rs.getLong("total_amount")));
            }
            return rows;
        }
    }

    public List<AllRewardsQuest> allRewardsDetailQuests(String rewardType, String itemType) throws SQLException {
        String itemCondition = itemType != null
            ? "AND COALESCE(item_type, '__none__') = COALESCE(?, '__none__')"
            : "AND item_type IS NULL";
        String sql = """
            SELECT quest_id, MAX(quest_title) AS quest_title, SUM(amount) AS total_amount
            FROM reward_claims
            WHERE reward_type = ? %s
            GROUP BY quest_id
            ORDER BY total_amount DESC
            LIMIT 20
            """.formatted(itemCondition);
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, rewardType);
            if (itemType != null) ps.setString(2, itemType);
            ResultSet rs = ps.executeQuery();
            List<AllRewardsQuest> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new AllRewardsQuest(rs.getInt("quest_id"), rs.getString("quest_title"), rs.getLong("total_amount")));
            }
            return rows;
        }
    }
}
