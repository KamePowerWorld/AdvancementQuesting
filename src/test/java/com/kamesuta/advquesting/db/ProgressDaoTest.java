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
 * ProgressDao の現在の振る舞いを固定する characterization テスト。
 * Bukkit 非依存 (一時ファイル SQLite に対して実行する)。
 */
class ProgressDaoTest {

    private static final String PLAYER = "11111111-1111-1111-1111-111111111111";
    private static final int QUEST = 42;

    private DatabaseManager db;
    private ProgressDao dao;

    @BeforeEach
    void setUp(@TempDir Path tempDir) throws SQLException {
        db = new DatabaseManager(new File(tempDir.toFile(), "quest.db"));
        dao = new ProgressDao(db);
    }

    @AfterEach
    void tearDown() {
        db.close();
    }

    @Test
    void findByPlayerAndQuestReturnsNullWhenAbsent() throws SQLException {
        assertNull(dao.findByPlayerAndQuest(PLAYER, QUEST));
    }

    @Test
    void upsertInsertsThenUpdatesSameRow() throws SQLException {
        dao.upsertProgress(PLAYER, QUEST, "[{\"a\":1}]", false, null);
        ProgressDao.ProgressRecord first = dao.findByPlayerAndQuest(PLAYER, QUEST);
        assertNotNull(first);
        assertEquals("[{\"a\":1}]", first.progress());
        assertFalse(first.completed());
        assertNull(first.completedAt());

        // 同じ (player, quest) で upsert すると新規行にならず更新される
        dao.upsertProgress(PLAYER, QUEST, "[{\"a\":2}]", true, "2026-01-01T00:00:00Z");
        List<ProgressDao.ProgressRecord> all = dao.findByPlayer(PLAYER);
        assertEquals(1, all.size(), "upsert should not create a second row");
        ProgressDao.ProgressRecord updated = all.get(0);
        assertEquals("[{\"a\":2}]", updated.progress());
        assertTrue(updated.completed());
        assertEquals("2026-01-01T00:00:00Z", updated.completedAt());
    }

    @Test
    void incrementCompletedCountBumpsCountAndPendingRewards() throws SQLException {
        dao.upsertProgress(PLAYER, QUEST, "[]", true, "2026-01-01T00:00:00Z");
        dao.incrementCompletedCount(PLAYER, QUEST);
        dao.incrementCompletedCount(PLAYER, QUEST);
        ProgressDao.ProgressRecord r = dao.findByPlayerAndQuest(PLAYER, QUEST);
        assertEquals(2, r.completedCount());
        assertEquals(2, r.pendingRewards());
    }

    @Test
    void resetForRepeatClearsProgressButKeepsCompletedAt() throws SQLException {
        dao.upsertProgress(PLAYER, QUEST, "[{\"a\":9}]", true, "2026-01-01T00:00:00Z");
        dao.incrementCompletedCount(PLAYER, QUEST); // pending_rewards=1
        dao.resetForRepeat(PLAYER, QUEST);

        ProgressDao.ProgressRecord r = dao.findByPlayerAndQuest(PLAYER, QUEST);
        assertEquals("[]", r.progress());
        assertFalse(r.completed());
        assertFalse(r.rewardClaimed());
        assertEquals("2026-01-01T00:00:00Z", r.completedAt(), "completed_at should be preserved");
        assertEquals(1, r.pendingRewards(), "pending_rewards should be untouched by reset");
    }

    @Test
    void resetForRepeatWithProgressCarriesGivenJson() throws SQLException {
        dao.upsertProgress(PLAYER, QUEST, "[]", true, "2026-01-01T00:00:00Z");
        dao.resetForRepeatWithProgress(PLAYER, QUEST, "[{\"base\":5}]");
        assertEquals("[{\"base\":5}]", dao.findByPlayerAndQuest(PLAYER, QUEST).progress());
    }

    @Test
    void claimOnePendingRewardDecrementsAndSetsClaimedAtZero() throws SQLException {
        dao.upsertProgress(PLAYER, QUEST, "[]", true, "2026-01-01T00:00:00Z");
        dao.incrementCompletedCount(PLAYER, QUEST); // pending_rewards=1, completed=1

        assertTrue(dao.claimOnePendingReward(PLAYER, QUEST));
        ProgressDao.ProgressRecord r = dao.findByPlayerAndQuest(PLAYER, QUEST);
        assertEquals(0, r.pendingRewards());
        assertTrue(r.rewardClaimed(), "reward_claimed becomes 1 when pending reaches 0 and completed");

        // これ以上は減らせない
        assertFalse(dao.claimOnePendingReward(PLAYER, QUEST));
    }

    @Test
    void markRewardClaimedOnlyWhenCompletedAndUnclaimed() throws SQLException {
        // 未完了なら false
        dao.upsertProgress(PLAYER, QUEST, "[]", false, null);
        assertFalse(dao.markRewardClaimed(PLAYER, QUEST));

        // 完了済みなら true、二重受取は false
        dao.upsertProgress(PLAYER, QUEST, "[]", true, "2026-01-01T00:00:00Z");
        assertTrue(dao.markRewardClaimed(PLAYER, QUEST));
        assertFalse(dao.markRewardClaimed(PLAYER, QUEST));
    }

    @Test
    void setCompletedFalseResetsRewardClaimed() throws SQLException {
        dao.upsertProgress(PLAYER, QUEST, "[]", true, "2026-01-01T00:00:00Z");
        assertTrue(dao.markRewardClaimed(PLAYER, QUEST));
        assertTrue(dao.findByPlayerAndQuest(PLAYER, QUEST).rewardClaimed());

        dao.setCompleted(PLAYER, QUEST, false, "[]");
        ProgressDao.ProgressRecord r = dao.findByPlayerAndQuest(PLAYER, QUEST);
        assertFalse(r.completed());
        assertFalse(r.rewardClaimed(), "reward_claimed resets to 0 when set incomplete");
    }

    @Test
    void findByQuestReturnsAllPlayers() throws SQLException {
        String other = "22222222-2222-2222-2222-222222222222";
        dao.upsertProgress(PLAYER, QUEST, "[]", false, null);
        dao.upsertProgress(other, QUEST, "[]", false, null);
        dao.upsertProgress(PLAYER, 99, "[]", false, null);

        assertEquals(2, dao.findByQuest(QUEST).size());
    }
}
