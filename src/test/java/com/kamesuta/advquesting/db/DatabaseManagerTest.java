package com.kamesuta.advquesting.db;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.file.Path;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * migrate() が現在生成するスキーマの振る舞いを固定する characterization テスト。
 * Bukkit を必要としないよう File コンストラクタを用いる。
 */
class DatabaseManagerTest {

    private DatabaseManager open(Path tempDir) throws SQLException {
        return openFile(new File(tempDir.toFile(), "quest.db"));
    }

    private DatabaseManager openFile(File dbFile) throws SQLException {
        return new DatabaseManager(dbFile);
    }

    @Test
    void migrateCreatesAllExpectedTables(@TempDir Path tempDir) throws SQLException {
        try (DatabaseManager db = open(tempDir)) {
            Set<String> tables = new HashSet<>();
            try (Statement st = db.getConnection().createStatement();
                 ResultSet rs = st.executeQuery(
                     "SELECT name FROM sqlite_master WHERE type='table'")) {
                while (rs.next()) tables.add(rs.getString("name"));
            }
            assertTrue(tables.containsAll(Set.of(
                "player_sessions",
                "auth_codes",
                "quest_proposals",
                "proposal_votes",
                "player_progress",
                "quest_completions",
                "reward_claims",
                "dashboard_configs"
            )), "expected core tables present, got: " + tables);
        }
    }

    @Test
    void playerProgressHasRepeatColumns(@TempDir Path tempDir) throws SQLException {
        try (DatabaseManager db = open(tempDir)) {
            Set<String> columns = new HashSet<>();
            try (Statement st = db.getConnection().createStatement();
                 ResultSet rs = st.executeQuery("PRAGMA table_info(player_progress)")) {
                while (rs.next()) columns.add(rs.getString("name"));
            }
            assertTrue(columns.contains("completed_count"),
                "completed_count column should be added by migration");
            assertTrue(columns.contains("pending_rewards"),
                "pending_rewards column should be added by migration");
        }
    }

    @Test
    void migrateIsIdempotent(@TempDir Path tempDir) throws SQLException {
        File dbFile = new File(tempDir.toFile(), "quest.db");
        // 同一ファイルに対して2回目を開いても例外なく再マイグレーションできること。
        openFile(dbFile).close();
        DatabaseManager second = openFile(dbFile);
        assertFalse(second.getConnection().isClosed());
        second.close();
    }

    @Test
    void closeClosesConnection(@TempDir Path tempDir) throws SQLException {
        DatabaseManager db = open(tempDir);
        assertFalse(db.getConnection().isClosed());
        db.close();
        assertTrue(db.getConnection().isClosed());
    }
}
