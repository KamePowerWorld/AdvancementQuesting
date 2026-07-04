package com.kamesuta.advquesting.db;

import java.sql.SQLException;
import java.time.Instant;

public class SessionDao extends BaseDao {

    public record SessionInfo(String token, String playerUuid, String playerName, String role) {
        public boolean isEditor() { return "editor".equals(role) || "admin".equals(role); }
        public boolean isAdmin()  { return "admin".equals(role); }
    }

    public SessionDao(DatabaseManager db) {
        super(db);
    }

    public SessionInfo findByToken(String token) throws SQLException {
        return queryOne(
            "SELECT player_uuid, player_name, role FROM player_sessions WHERE session_token=? AND expires_at>?",
            rs -> new SessionInfo(token, rs.getString(1), rs.getString(2), rs.getString(3)),
            token, Instant.now().getEpochSecond());
    }

    public void insert(String token, String playerUuid, String playerName, String role, Instant expiresAt) throws SQLException {
        update("""
            INSERT INTO player_sessions (session_token, player_uuid, player_name, role, created_at, expires_at)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(session_token) DO UPDATE SET expires_at=excluded.expires_at
            """, token, playerUuid, playerName, role, Instant.now().getEpochSecond(), expiresAt.getEpochSecond());
    }

    public void delete(String token) throws SQLException {
        update("DELETE FROM player_sessions WHERE session_token=?", token);
    }
}
