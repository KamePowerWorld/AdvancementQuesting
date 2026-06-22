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
        String completedAt,
        int completedCount,
        int pendingRewards
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

    /** 特定クエストの全プレイヤー進捗を取得（繰り返しリセット用） */
    public List<ProgressRecord> findByQuest(int questId) throws SQLException {
        String sql = "SELECT * FROM player_progress WHERE quest_id = ?";
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setInt(1, questId);
            return toList(ps.executeQuery());
        }
    }

    /**
     * 条件の達成状態を更新する。
     * 進捗レコードがなければ自動作成。
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
     * クエスト完了時に completedCount をインクリメントし pending_rewards を加算する。
     * 繰り返しクエスト用。
     */
    public void incrementCompletedCount(String playerUuid, int questId) throws SQLException {
        String sql = """
            UPDATE player_progress
            SET completed_count = completed_count + 1,
                pending_rewards = pending_rewards + 1
            WHERE player_uuid = ? AND quest_id = ?
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ps.setInt(2, questId);
            ps.executeUpdate();
        }
    }

    /**
     * 繰り返しクエストをリセットする（進捗をクリアして再挑戦可能にする）。
     * completed_at は保持し、pending_rewards は変更しない。
     */
    public void resetForRepeat(String playerUuid, int questId) throws SQLException {
        resetForRepeatWithProgress(playerUuid, questId, "[]");
    }

    /**
     * 繰り返しクエストをリセットする。stat/scoreboard 条件の baseValue を引き継いだ進捗JSONを設定する。
     * completed_at は保持し、pending_rewards は変更しない。
     */
    public void resetForRepeatWithProgress(String playerUuid, int questId, String progressJson) throws SQLException {
        String sql = """
            UPDATE player_progress
            SET progress = ?, completed = 0, reward_claimed = 0
            WHERE player_uuid = ? AND quest_id = ?
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, progressJson);
            ps.setString(2, playerUuid);
            ps.setInt(3, questId);
            ps.executeUpdate();
        }
    }

    /**
     * クエストの完了状態を強制的に設定する（管理コマンド用）。
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

    /**
     * 報酬受け取り: pending_rewards を1減らし reward_claimed フラグを更新する。
     * pending_rewards が 0 になったら reward_claimed = 1 にする。
     * @return 減らせた場合 true
     */
    public boolean claimOnePendingReward(String playerUuid, int questId) throws SQLException {
        // pending_rewards > 0 のレコードを1減らす
        String sql = """
            UPDATE player_progress
            SET pending_rewards = pending_rewards - 1,
                reward_claimed = CASE WHEN pending_rewards - 1 <= 0 AND completed = 1 THEN 1 ELSE reward_claimed END
            WHERE player_uuid = ? AND quest_id = ? AND pending_rewards > 0
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ps.setInt(2, questId);
            return ps.executeUpdate() > 0;
        }
    }

    /** 従来の報酬受け取り済みにする（非繰り返し用） */
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
            rs.getString("completed_at"),
            rs.getInt("completed_count"),
            rs.getInt("pending_rewards")
        );
    }
}
