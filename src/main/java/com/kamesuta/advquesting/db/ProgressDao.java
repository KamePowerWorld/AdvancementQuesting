package com.kamesuta.advquesting.db;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

public class ProgressDao extends BaseDao {

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

    public ProgressDao(DatabaseManager db) {
        super(db);
    }

    /** プレイヤーの全進捗を取得 */
    public List<ProgressRecord> findByPlayer(String playerUuid) throws SQLException {
        return queryList("SELECT * FROM player_progress WHERE player_uuid = ?", this::fromRow, playerUuid);
    }

    /** 特定クエストの進捗を取得（なければ null） */
    public ProgressRecord findByPlayerAndQuest(String playerUuid, int questId) throws SQLException {
        return queryOne("SELECT * FROM player_progress WHERE player_uuid = ? AND quest_id = ?", this::fromRow, playerUuid, questId);
    }

    /** 特定クエストの全プレイヤー進捗を取得（繰り返しリセット用） */
    public List<ProgressRecord> findByQuest(int questId) throws SQLException {
        return queryList("SELECT * FROM player_progress WHERE quest_id = ?", this::fromRow, questId);
    }

    /**
     * 条件の達成状態を更新する。
     * 進捗レコードがなければ自動作成。
     */
    public void upsertProgress(String playerUuid, int questId, String progressJson,
                               boolean completed, String completedAt) throws SQLException {
        update("""
            INSERT INTO player_progress (player_uuid, quest_id, progress, completed, completed_at, started_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_uuid, quest_id) DO UPDATE SET
                progress = excluded.progress,
                completed = excluded.completed,
                completed_at = excluded.completed_at
            """, playerUuid, questId, progressJson, completed ? 1 : 0, completedAt, Instant.now().toString());
    }

    /**
     * クエスト完了時に completedCount をインクリメントし pending_rewards を加算する。
     * 繰り返しクエスト用。
     */
    public void incrementCompletedCount(String playerUuid, int questId) throws SQLException {
        update("""
            UPDATE player_progress
            SET completed_count = completed_count + 1,
                pending_rewards = pending_rewards + 1
            WHERE player_uuid = ? AND quest_id = ?
            """, playerUuid, questId);
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
        update("""
            UPDATE player_progress
            SET progress = ?, completed = 0, reward_claimed = 0
            WHERE player_uuid = ? AND quest_id = ?
            """, progressJson, playerUuid, questId);
    }

    /**
     * クエストの完了状態を強制的に設定する（管理コマンド用）。
     */
    public void setCompleted(String playerUuid, int questId, boolean completed, String progressJson) throws SQLException {
        String completedAt = completed ? Instant.now().toString() : null;
        update("""
            INSERT INTO player_progress (player_uuid, quest_id, progress, completed, completed_at, started_at, reward_claimed)
            VALUES (?, ?, ?, ?, ?, ?, 0)
            ON CONFLICT(player_uuid, quest_id) DO UPDATE SET
                progress = excluded.progress,
                completed = excluded.completed,
                completed_at = excluded.completed_at,
                reward_claimed = CASE WHEN excluded.completed = 0 THEN 0 ELSE player_progress.reward_claimed END
            """, playerUuid, questId, progressJson, completed ? 1 : 0, completedAt, Instant.now().toString());
    }

    /**
     * 報酬受け取り: pending_rewards を1減らし reward_claimed フラグを更新する。
     * pending_rewards が 0 になったら reward_claimed = 1 にする。
     * @return 減らせた場合 true
     */
    public boolean claimOnePendingReward(String playerUuid, int questId) throws SQLException {
        // pending_rewards > 0 のレコードを1減らす
        return update("""
            UPDATE player_progress
            SET pending_rewards = pending_rewards - 1,
                reward_claimed = CASE WHEN pending_rewards - 1 <= 0 AND completed = 1 THEN 1 ELSE reward_claimed END
            WHERE player_uuid = ? AND quest_id = ? AND pending_rewards > 0
            """, playerUuid, questId) > 0;
    }

    /** 従来の報酬受け取り済みにする（非繰り返し用） */
    public boolean markRewardClaimed(String playerUuid, int questId) throws SQLException {
        return update("""
            UPDATE player_progress SET reward_claimed = 1
            WHERE player_uuid = ? AND quest_id = ? AND completed = 1 AND reward_claimed = 0
            """, playerUuid, questId) > 0;
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
