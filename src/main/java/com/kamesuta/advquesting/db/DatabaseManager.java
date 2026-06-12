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
                    quest_id      INTEGER NOT NULL,
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
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_uuid  TEXT NOT NULL,
                    quest_id     INTEGER NOT NULL,
                    progress     TEXT NOT NULL DEFAULT '[]',
                    completed    INTEGER NOT NULL DEFAULT 0,
                    reward_claimed INTEGER NOT NULL DEFAULT 0,
                    started_at   INTEGER NOT NULL,
                    completed_at INTEGER,
                    UNIQUE (player_uuid, quest_id)
                )""");
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
