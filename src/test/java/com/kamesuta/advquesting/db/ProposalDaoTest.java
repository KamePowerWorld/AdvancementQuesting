package com.kamesuta.advquesting.db;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ProposalDao の現在の振る舞いを固定する characterization テスト。
 * Bukkit 非依存 (一時ファイル SQLite に対して実行する)。
 */
class ProposalDaoTest {

    private static final String PROPOSER = "11111111-1111-1111-1111-111111111111";
    private static final String VOTER = "22222222-2222-2222-2222-222222222222";

    private DatabaseManager db;
    private ProposalDao dao;

    @BeforeEach
    void setUp(@TempDir Path tempDir) throws SQLException {
        db = new DatabaseManager(new File(tempDir.toFile(), "quest.db"));
        dao = new ProposalDao(db);
    }

    @AfterEach
    void tearDown() {
        db.close();
    }

    @Test
    void createはpendingで生成されfindByIdで取得できる() throws SQLException {
        ProposalDao.ProposalRecord created = dao.create(10, PROPOSER, "Steve");
        assertNotNull(created);
        assertEquals(10, created.questId());
        assertEquals(PROPOSER, created.proposerUuid());
        assertEquals("Steve", created.proposerName());
        assertEquals("pending", created.status());
        assertEquals(0, created.votesUp());
        assertEquals(0, created.votesDown());
        assertNull(created.rejectReason());

        ProposalDao.ProposalRecord found = dao.findById(created.id());
        assertNotNull(found);
        assertEquals(created.id(), found.id());
    }

    @Test
    void findByIdは存在しないidでnullを返す() throws SQLException {
        assertNull(dao.findById(999));
    }

    @Test
    void findAllとfindPendingはステータスで絞り込む() throws SQLException {
        ProposalDao.ProposalRecord p1 = dao.create(1, PROPOSER, "Steve");
        ProposalDao.ProposalRecord p2 = dao.create(2, PROPOSER, "Steve");
        dao.approve(p2.id());

        List<ProposalDao.ProposalRecord> all = dao.findAll();
        assertEquals(2, all.size());

        List<ProposalDao.ProposalRecord> pending = dao.findPending();
        assertEquals(1, pending.size());
        assertEquals(p1.id(), pending.get(0).id());
    }

    @Test
    void approveはpendingのみ成功し2回目はfalse() throws SQLException {
        ProposalDao.ProposalRecord p = dao.create(1, PROPOSER, "Steve");
        assertTrue(dao.approve(p.id()));
        assertEquals("approved", dao.findById(p.id()).status());
        assertFalse(dao.approve(p.id()));
    }

    @Test
    void rejectは理由を保存しpending以外はfalse() throws SQLException {
        ProposalDao.ProposalRecord p = dao.create(1, PROPOSER, "Steve");
        assertTrue(dao.reject(p.id(), "duplicate"));
        ProposalDao.ProposalRecord after = dao.findById(p.id());
        assertEquals("rejected", after.status());
        assertEquals("duplicate", after.rejectReason());
        assertFalse(dao.reject(p.id(), "again"));
    }

    @Test
    void deleteは削除の成否を返す() throws SQLException {
        ProposalDao.ProposalRecord p = dao.create(1, PROPOSER, "Steve");
        assertTrue(dao.delete(p.id()));
        assertNull(dao.findById(p.id()));
        assertFalse(dao.delete(p.id()));
    }

    @Test
    void voteは新規投票でカウントを増やしgetMyVoteに反映される() throws SQLException {
        ProposalDao.ProposalRecord p = dao.create(1, PROPOSER, "Steve");
        assertEquals("up", dao.vote(p.id(), VOTER, "up"));
        assertEquals("up", dao.getMyVote(p.id(), VOTER));
        assertEquals(1, dao.findById(p.id()).votesUp());
        assertEquals(0, dao.findById(p.id()).votesDown());
    }

    @Test
    void voteは同方向で取り消しになる() throws SQLException {
        ProposalDao.ProposalRecord p = dao.create(1, PROPOSER, "Steve");
        dao.vote(p.id(), VOTER, "up");
        assertNull(dao.vote(p.id(), VOTER, "up"));
        assertNull(dao.getMyVote(p.id(), VOTER));
        assertEquals(0, dao.findById(p.id()).votesUp());
    }

    @Test
    void voteは逆方向で上書きされる() throws SQLException {
        ProposalDao.ProposalRecord p = dao.create(1, PROPOSER, "Steve");
        dao.vote(p.id(), VOTER, "up");
        assertEquals("down", dao.vote(p.id(), VOTER, "down"));
        assertEquals("down", dao.getMyVote(p.id(), VOTER));
        ProposalDao.ProposalRecord after = dao.findById(p.id());
        assertEquals(0, after.votesUp());
        assertEquals(1, after.votesDown());
    }

    @Test
    void getMyVoteは未投票でnullを返す() throws SQLException {
        ProposalDao.ProposalRecord p = dao.create(1, PROPOSER, "Steve");
        assertNull(dao.getMyVote(p.id(), VOTER));
    }
}
