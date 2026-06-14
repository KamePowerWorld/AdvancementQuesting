package com.kamesuta.advquesting.db;

import java.sql.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class ProgressDao {

    public record ProgressRecord(
        int id,
        String playerUuid,
        int questId,
        String progress,   // JSON 配列文字列
        boolean completed,
        boolean rewardClaimed,
        String startedAt,
        String completedAt
    ) {}

    private final DatabaseManager db;

    public ProgressDao(DatabaseManager db) {
        this.db = db;
    }

    /** プレイヤーの全進捗を取得 */
    public List<ProgressRecord> findByPlayer(String playerUuid) throws SQLException {
        String sql = "SELECT * FROM player_progress WHERE player_uuid = ?";
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            return toList(ps.executeQuery());
        }
    }

    /** 特定クエストの進捗を取得（なければ null） */
    public ProgressRecord findByPlayerAndQuest(String playerUuid, int questId) throws SQLException {
        String sql = "SELECT * FROM player_progress WHERE player_uuid = ? AND quest_id = ?";
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ps.setInt(2, questId);
            ResultSet rs = ps.executeQuery();
            if (rs.next()) return fromRow(rs);
            return null;
        }
    }

    /**
     * 条件の達成状態を更新する。
     * 進捗レコードがなければ自動作成。
     * progress は JSON 配列 "[{\"conditionId\":\"c1\",\"completed\":true}, ...]"
     */
    public void upsertProgress(String playerUuid, int questId, String progressJson,
                               boolean completed, String completedAt) throws SQLException {
        String sql = """
            INSERT INTO player_progress (player_uuid, quest_id, progress, completed, completed_at, started_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_uuid, quest_id) DO UPDATE SET
                progress = excluded.progress,
                completed = excluded.completed,
                completed_at = excluded.completed_at
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ps.setInt(2, questId);
            ps.setString(3, progressJson);
            ps.setInt(4, completed ? 1 : 0);
            ps.setString(5, completedAt);
            ps.setString(6, Instant.now().toString());
            ps.executeUpdate();
        }
    }

    /**
     * クエストの完了状態を強制的に設定する（管理コマンド用）。
     * 進捗レコードがなければ作成する。未完了に戻す場合は条件進捗・報酬受取フラグもリセットする。
     * @param progressJson complete時に全条件完了にするJSON、uncomplete時は '[]'
     */
    public void setCompleted(String playerUuid, int questId, boolean completed, String progressJson) throws SQLException {
        String completedAt = completed ? Instant.now().toString() : null;
        String sql = """
            INSERT INTO player_progress (player_uuid, quest_id, progress, completed, completed_at, started_at, reward_claimed)
            VALUES (?, ?, ?, ?, ?, ?, 0)
            ON CONFLICT(player_uuid, quest_id) DO UPDATE SET
                progress = excluded.progress,
                completed = excluded.completed,
                completed_at = excluded.completed_at,
                reward_claimed = CASE WHEN excluded.completed = 0 THEN 0 ELSE player_progress.reward_claimed END
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ps.setInt(2, questId);
            ps.setString(3, progressJson);
            ps.setInt(4, completed ? 1 : 0);
            ps.setString(5, completedAt);
            ps.setString(6, Instant.now().toString());
            ps.executeUpdate();
        }
    }

    /** 報酬受け取り済みにする */
    public boolean markRewardClaimed(String playerUuid, int questId) throws SQLException {
        String sql = """
            UPDATE player_progress SET reward_claimed = 1
            WHERE player_uuid = ? AND quest_id = ? AND completed = 1 AND reward_claimed = 0
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ps.setInt(2, questId);
            return ps.executeUpdate() > 0;
        }
    }

    private List<ProgressRecord> toList(ResultSet rs) throws SQLException {
        List<ProgressRecord> list = new ArrayList<>();
        while (rs.next()) list.add(fromRow(rs));
        return list;
    }

    private ProgressRecord fromRow(ResultSet rs) throws SQLException {
        return new ProgressRecord(
            rs.getInt("id"),
            rs.getString("player_uuid"),
            rs.getInt("quest_id"),
            rs.getString("progress"),
            rs.getInt("completed") == 1,
            rs.getInt("reward_claimed") == 1,
            rs.getString("started_at"),
            rs.getString("completed_at")
        );
    }
}
