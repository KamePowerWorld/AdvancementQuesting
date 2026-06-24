package com.kamesuta.advquesting.db;

import org.bukkit.plugin.Plugin;

import java.io.File;
import java.sql.*;

public class DatabaseManager {

    private final Connection conn;

    public DatabaseManager(Plugin plugin) throws SQLException {
        File dbFile = new File(plugin.getDataFolder(), "quest.db");
        conn = DriverManager.getConnection("jdbc:sqlite:" + dbFile.getAbsolutePath());
        try (Statement st = conn.createStatement()) {
            st.execute("PRAGMA journal_mode=WAL");
            st.execute("PRAGMA foreign_keys=ON");
        }
        migrate();
    }

    private void migrate() throws SQLException {
        try (Statement st = conn.createStatement()) {
            // ---- v1: 初期スキーマ ----
            st.execute("""
                CREATE TABLE IF NOT EXISTS player_sessions (
                    session_token TEXT PRIMARY KEY,
                    player_uuid   TEXT NOT NULL,
                    player_name   TEXT NOT NULL,
                    role          TEXT NOT NULL DEFAULT 'player',
                    created_at    INTEGER NOT NULL,
                    expires_at    INTEGER NOT NULL
                )""");
            st.execute("""
                CREATE TABLE IF NOT EXISTS auth_codes (
                    code        TEXT PRIMARY KEY,
                    player_uuid TEXT NOT NULL,
                    player_name TEXT NOT NULL,
                    role        TEXT NOT NULL DEFAULT 'player',
                    created_at  INTEGER NOT NULL,
                    expires_at  INTEGER NOT NULL,
                    used        INTEGER NOT NULL DEFAULT 0
                )""");
            st.execute("""
                CREATE TABLE IF NOT EXISTS quest_proposals (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    questline_id  TEXT NOT NULL DEFAULT '00000000',
                    quest_id      TEXT NOT NULL,
                    proposer_uuid TEXT NOT NULL,
                    proposer_name TEXT NOT NULL,
                    status        TEXT NOT NULL DEFAULT 'pending',
                    votes_up      INTEGER NOT NULL DEFAULT 0,
                    votes_down    INTEGER NOT NULL DEFAULT 0,
                    reject_reason TEXT,
                    created_at    INTEGER NOT NULL
                )""");
            st.execute("""
                CREATE TABLE IF NOT EXISTS proposal_votes (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    proposal_id INTEGER NOT NULL REFERENCES quest_proposals(id),
                    player_uuid TEXT NOT NULL,
                    vote_type   TEXT NOT NULL,
                    voted_at    INTEGER NOT NULL,
                    UNIQUE (proposal_id, player_uuid)
                )""");
            st.execute("""
                CREATE TABLE IF NOT EXISTS player_progress (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_uuid    TEXT NOT NULL,
                    questline_id   TEXT NOT NULL DEFAULT '00000000',
                    quest_id       TEXT NOT NULL,
                    progress       TEXT NOT NULL DEFAULT '[]',
                    completed      INTEGER NOT NULL DEFAULT 0,
                    reward_claimed INTEGER NOT NULL DEFAULT 0,
                    started_at     TEXT NOT NULL,
                    completed_at   TEXT,
                    completed_count  INTEGER NOT NULL DEFAULT 0,
                    pending_rewards  INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (player_uuid, questline_id, quest_id)
                )""");
            st.execute("""
                CREATE TABLE IF NOT EXISTS quest_completions (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_uuid  TEXT NOT NULL,
                    player_name  TEXT NOT NULL,
                    questline_id TEXT NOT NULL DEFAULT '00000000',
                    quest_id     TEXT NOT NULL,
                    completed_at TEXT NOT NULL
                )""");
            st.execute("CREATE INDEX IF NOT EXISTS idx_completions_quest ON quest_completions (questline_id, quest_id)");
            st.execute("CREATE INDEX IF NOT EXISTS idx_completions_quest_time ON quest_completions (questline_id, quest_id, completed_at)");
            st.execute("CREATE INDEX IF NOT EXISTS idx_completions_quest_player ON quest_completions (questline_id, quest_id, player_uuid)");
            st.execute("CREATE INDEX IF NOT EXISTS idx_completions_player_id ON quest_completions (player_uuid, id)");

            st.execute("""
                CREATE TABLE IF NOT EXISTS reward_claims (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_uuid  TEXT NOT NULL,
                    player_name  TEXT NOT NULL,
                    questline_id TEXT NOT NULL DEFAULT '00000000',
                    quest_id     TEXT NOT NULL,
                    quest_title  TEXT NOT NULL,
                    reward_type  TEXT NOT NULL,
                    reward_label TEXT,
                    item_type    TEXT,
                    amount       INTEGER NOT NULL DEFAULT 1,
                    claimed_at   TEXT NOT NULL,
                    source       TEXT NOT NULL DEFAULT 'claim'
                )""");
            st.execute("CREATE INDEX IF NOT EXISTS idx_claims_player ON reward_claims (player_uuid)");
            st.execute("CREATE INDEX IF NOT EXISTS idx_claims_quest ON reward_claims (questline_id, quest_id)");
        }

        // ---- v2 マイグレーション: quest_id INTEGER → TEXT + questline_id 追加 ----
        int version = getUserVersion();
        if (version < 2) {
            migrateV1toV2();
            setUserVersion(2);
        }
    }

    /**
     * 旧スキーマ (quest_id INTEGER) から新スキーマ (questline_id TEXT + quest_id TEXT) へ移行。
     * テーブルごとに個別チェックして、部分的に移行済みの場合でも安全に完了できる。
     * proposal_votes → quest_proposals の外部キー制約を回避するため、FK を一時無効化する。
     */
    private void migrateV1toV2() throws SQLException {
        // DROP TABLE 時の FK 制約エラーを防ぐため一時的に無効化
        try (Statement st = conn.createStatement()) {
            st.execute("PRAGMA foreign_keys=OFF");
        }
        try {
            try (Statement st = conn.createStatement()) {
                // ---- player_progress ----
                if (isIntegerQuestId("player_progress")) {
                    st.execute("DROP TABLE IF EXISTS player_progress_v2");
                    st.execute("""
                        CREATE TABLE player_progress_v2 (
                            id             INTEGER PRIMARY KEY AUTOINCREMENT,
                            player_uuid    TEXT NOT NULL,
                            questline_id   TEXT NOT NULL DEFAULT '00000000',
                            quest_id       TEXT NOT NULL,
                            progress       TEXT NOT NULL DEFAULT '[]',
                            completed      INTEGER NOT NULL DEFAULT 0,
                            reward_claimed INTEGER NOT NULL DEFAULT 0,
                            started_at     TEXT NOT NULL,
                            completed_at   TEXT,
                            completed_count  INTEGER NOT NULL DEFAULT 0,
                            pending_rewards  INTEGER NOT NULL DEFAULT 0,
                            UNIQUE (player_uuid, questline_id, quest_id)
                        )""");
                    st.execute("""
                        INSERT INTO player_progress_v2
                            (player_uuid, questline_id, quest_id, progress, completed, reward_claimed,
                             started_at, completed_at, completed_count, pending_rewards)
                        SELECT player_uuid, '00000000', CAST(quest_id AS TEXT), progress, completed, reward_claimed,
                               COALESCE(CAST(started_at AS TEXT), datetime('now')),
                               CAST(completed_at AS TEXT),
                               COALESCE(completed_count, 0), COALESCE(pending_rewards, 0)
                        FROM player_progress
                        """);
                    st.execute("DROP TABLE player_progress");
                    st.execute("ALTER TABLE player_progress_v2 RENAME TO player_progress");
                }

                // ---- quest_completions ----
                if (isIntegerQuestId("quest_completions")) {
                    st.execute("DROP TABLE IF EXISTS quest_completions_v2");
                    st.execute("""
                        CREATE TABLE quest_completions_v2 (
                            id           INTEGER PRIMARY KEY AUTOINCREMENT,
                            player_uuid  TEXT NOT NULL,
                            player_name  TEXT NOT NULL,
                            questline_id TEXT NOT NULL DEFAULT '00000000',
                            quest_id     TEXT NOT NULL,
                            completed_at TEXT NOT NULL
                        )""");
                    st.execute("""
                        INSERT INTO quest_completions_v2
                            (id, player_uuid, player_name, questline_id, quest_id, completed_at)
                        SELECT id, player_uuid, player_name, '00000000', CAST(quest_id AS TEXT), completed_at
                        FROM quest_completions
                        """);
                    st.execute("DROP TABLE quest_completions");
                    st.execute("ALTER TABLE quest_completions_v2 RENAME TO quest_completions");
                    st.execute("CREATE INDEX IF NOT EXISTS idx_completions_quest ON quest_completions (questline_id, quest_id)");
                    st.execute("CREATE INDEX IF NOT EXISTS idx_completions_quest_time ON quest_completions (questline_id, quest_id, completed_at)");
                    st.execute("CREATE INDEX IF NOT EXISTS idx_completions_quest_player ON quest_completions (questline_id, quest_id, player_uuid)");
                    st.execute("CREATE INDEX IF NOT EXISTS idx_completions_player_id ON quest_completions (player_uuid, id)");
                }

                // ---- reward_claims ----
                if (isIntegerQuestId("reward_claims")) {
                    st.execute("DROP TABLE IF EXISTS reward_claims_v2");
                    st.execute("""
                        CREATE TABLE reward_claims_v2 (
                            id           INTEGER PRIMARY KEY AUTOINCREMENT,
                            player_uuid  TEXT NOT NULL,
                            player_name  TEXT NOT NULL,
                            questline_id TEXT NOT NULL DEFAULT '00000000',
                            quest_id     TEXT NOT NULL,
                            quest_title  TEXT NOT NULL,
                            reward_type  TEXT NOT NULL,
                            reward_label TEXT,
                            item_type    TEXT,
                            amount       INTEGER NOT NULL DEFAULT 1,
                            claimed_at   TEXT NOT NULL,
                            source       TEXT NOT NULL DEFAULT 'claim'
                        )""");
                    st.execute("""
                        INSERT INTO reward_claims_v2
                            (id, player_uuid, player_name, questline_id, quest_id, quest_title,
                             reward_type, reward_label, item_type, amount, claimed_at, source)
                        SELECT id, player_uuid, player_name, '00000000', CAST(quest_id AS TEXT), quest_title,
                               reward_type, reward_label, item_type, amount, claimed_at, source
                        FROM reward_claims
                        """);
                    st.execute("DROP TABLE reward_claims");
                    st.execute("ALTER TABLE reward_claims_v2 RENAME TO reward_claims");
                    st.execute("CREATE INDEX IF NOT EXISTS idx_claims_player ON reward_claims (player_uuid)");
                    st.execute("CREATE INDEX IF NOT EXISTS idx_claims_quest ON reward_claims (questline_id, quest_id)");
                }

                // ---- quest_proposals ----
                if (isIntegerQuestId("quest_proposals")) {
                    // 既存の_v2テーブルが残っている場合は削除してやり直す
                    st.execute("DROP TABLE IF EXISTS quest_proposals_v2");
                    st.execute("""
                        CREATE TABLE quest_proposals_v2 (
                            id            INTEGER PRIMARY KEY AUTOINCREMENT,
                            questline_id  TEXT NOT NULL DEFAULT '00000000',
                            quest_id      TEXT NOT NULL,
                            proposer_uuid TEXT NOT NULL,
                            proposer_name TEXT NOT NULL,
                            status        TEXT NOT NULL DEFAULT 'pending',
                            votes_up      INTEGER NOT NULL DEFAULT 0,
                            votes_down    INTEGER NOT NULL DEFAULT 0,
                            reject_reason TEXT,
                            created_at    INTEGER NOT NULL
                        )""");
                    st.execute("""
                        INSERT INTO quest_proposals_v2
                            (id, questline_id, quest_id, proposer_uuid, proposer_name,
                             status, votes_up, votes_down, reject_reason, created_at)
                        SELECT id, '00000000', CAST(quest_id AS TEXT), proposer_uuid, proposer_name,
                               status, votes_up, votes_down, reject_reason, created_at
                        FROM quest_proposals
                        """);
                    // foreign_keys=OFF のため proposal_votes が参照していても DROP できる
                    st.execute("DROP TABLE quest_proposals");
                    st.execute("ALTER TABLE quest_proposals_v2 RENAME TO quest_proposals");
                }
            }
        } finally {
            // 必ず FK を再有効化する
            try (Statement st = conn.createStatement()) {
                st.execute("PRAGMA foreign_keys=ON");
            }
        }
    }

    /** テーブルの quest_id 列が INTEGER 型かどうか確認する（旧スキーマ判定） */
    private boolean isIntegerQuestId(String tableName) throws SQLException {
        try (Statement st = conn.createStatement()) {
            ResultSet rs = st.executeQuery("PRAGMA table_info(" + tableName + ")");
            while (rs.next()) {
                if ("quest_id".equals(rs.getString("name"))) {
                    String type = rs.getString("type");
                    return "INTEGER".equalsIgnoreCase(type);
                }
            }
        }
        return false;
    }

    private int getUserVersion() throws SQLException {
        try (Statement st = conn.createStatement()) {
            ResultSet rs = st.executeQuery("PRAGMA user_version");
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    private void setUserVersion(int version) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("PRAGMA user_version = " + version);
        }
    }

    public Connection getConnection() {
        return conn;
    }

    public void close() {
        try {
            if (conn != null && !conn.isClosed()) conn.close();
        } catch (SQLException e) {
            // ignore on shutdown
        }
    }
}
