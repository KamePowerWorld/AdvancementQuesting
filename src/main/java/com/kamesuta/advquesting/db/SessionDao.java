package com.kamesuta.advquesting.db;

import java.sql.*;
import java.time.Instant;

public class SessionDao {

    public record SessionInfo(String token, String playerUuid, String playerName, String role) {
        public boolean isEditor() { return "editor".equals(role) || "admin".equals(role); }
        public boolean isAdmin()  { return "admin".equals(role); }
    }

    private final Connection conn;

    public SessionDao(DatabaseManager db) {
        this.conn = db.getConnection();
    }

    public SessionInfo findByToken(String token) throws SQLException {
        String sql = "SELECT player_uuid, player_name, role FROM player_sessions WHERE session_token=? AND expires_at>?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, token);
            ps.setLong(2, Instant.now().getEpochSecond());
            ResultSet rs = ps.executeQuery();
            if (!rs.next()) return null;
            return new SessionInfo(token, rs.getString(1), rs.getString(2), rs.getString(3));
        }
    }

    public void insert(String token, String playerUuid, String playerName, String role, Instant expiresAt) throws SQLException {
        String sql = """
            INSERT INTO player_sessions (session_token, player_uuid, player_name, role, created_at, expires_at)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(session_token) DO UPDATE SET expires_at=excluded.expires_at
            """;
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, token);
            ps.setString(2, playerUuid);
            ps.setString(3, playerName);
            ps.setString(4, role);
            ps.setLong(5, Instant.now().getEpochSecond());
            ps.setLong(6, expiresAt.getEpochSecond());
            ps.executeUpdate();
        }
    }

    public void delete(String token) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM player_sessions WHERE session_token=?")) {
            ps.setString(1, token);
            ps.executeUpdate();
        }
    }
}
