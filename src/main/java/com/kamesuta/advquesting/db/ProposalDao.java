package com.kamesuta.advquesting.db;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

public class ProposalDao extends BaseDao {

    public record ProposalRecord(
        int id,
        int questId,
        String proposerUuid,
        String proposerName,
        String status,
        int votesUp,
        int votesDown,
        String rejectReason,
        String createdAt
    ) {}

    public ProposalDao(DatabaseManager db) {
        super(db);
    }

    public List<ProposalRecord> findAll() throws SQLException {
        return queryList("SELECT * FROM quest_proposals ORDER BY created_at DESC", this::fromRow);
    }

    public List<ProposalRecord> findPending() throws SQLException {
        return queryList("SELECT * FROM quest_proposals WHERE status = 'pending' ORDER BY created_at DESC", this::fromRow);
    }

    public ProposalRecord findById(int id) throws SQLException {
        return queryOne("SELECT * FROM quest_proposals WHERE id = ?", this::fromRow, id);
    }

    public ProposalRecord create(int questId, String proposerUuid, String proposerName) throws SQLException {
        String sql = """
            INSERT INTO quest_proposals (quest_id, proposer_uuid, proposer_name, created_at)
            VALUES (?, ?, ?, ?)
            """;
        int id = insertReturningKey(sql, questId, proposerUuid, proposerName, Instant.now().toString());
        return findById(id);
    }

    public boolean delete(int id) throws SQLException {
        return update("DELETE FROM quest_proposals WHERE id = ?", id) > 0;
    }

    public boolean approve(int id) throws SQLException {
        return update("UPDATE quest_proposals SET status = 'approved' WHERE id = ? AND status = 'pending'", id) > 0;
    }

    public boolean reject(int id, String reason) throws SQLException {
        return update("UPDATE quest_proposals SET status = 'rejected', reject_reason = ? WHERE id = ? AND status = 'pending'", reason, id) > 0;
    }

    /** 投票: 同方向なら取り消し、逆方向なら上書き。votes_up/down を同期更新する。 */
    public String vote(int proposalId, String playerUuid, String voteType) throws SQLException {
        String existing = getMyVote(proposalId, playerUuid);

        if (voteType.equals(existing)) {
            // 同方向 → 取り消し
            update("DELETE FROM proposal_votes WHERE proposal_id = ? AND player_uuid = ?", proposalId, playerUuid);
            syncVoteCounts(proposalId);
            return null;
        } else {
            // 新規または上書き
            update("""
                INSERT INTO proposal_votes (proposal_id, player_uuid, vote_type, voted_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(proposal_id, player_uuid) DO UPDATE SET vote_type = excluded.vote_type, voted_at = excluded.voted_at
                """, proposalId, playerUuid, voteType, Instant.now().toString());
            syncVoteCounts(proposalId);
            return voteType;
        }
    }

    public String getMyVote(int proposalId, String playerUuid) throws SQLException {
        return queryOne("SELECT vote_type FROM proposal_votes WHERE proposal_id = ? AND player_uuid = ?",
            rs -> rs.getString("vote_type"), proposalId, playerUuid);
    }

    private void syncVoteCounts(int proposalId) throws SQLException {
        update("""
            UPDATE quest_proposals SET
                votes_up   = (SELECT COUNT(*) FROM proposal_votes WHERE proposal_id = ? AND vote_type = 'up'),
                votes_down = (SELECT COUNT(*) FROM proposal_votes WHERE proposal_id = ? AND vote_type = 'down')
            WHERE id = ?
            """, proposalId, proposalId, proposalId);
    }

    private ProposalRecord fromRow(ResultSet rs) throws SQLException {
        return new ProposalRecord(
            rs.getInt("id"),
            rs.getInt("quest_id"),
            rs.getString("proposer_uuid"),
            rs.getString("proposer_name"),
            rs.getString("status"),
            rs.getInt("votes_up"),
            rs.getInt("votes_down"),
            rs.getString("reject_reason"),
            rs.getString("created_at")
        );
    }
}
