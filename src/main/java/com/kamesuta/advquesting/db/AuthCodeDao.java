package com.kamesuta.advquesting.db;

import java.sql.*;
import java.time.Instant;
import java.util.UUID;

public class AuthCodeDao {

    public record AuthCodeResult(String token, String playerUuid, String playerName, String role) {}

    private final Connection conn;
    private final SessionDao sessionDao;

    public AuthCodeDao(DatabaseManager db, SessionDao sessionDao) {
        this.conn = db.getConnection();
        this.sessionDao = sessionDao;
    }

    public void insert(String code, String playerUuid, String playerName, String role, Instant expiresAt) throws SQLException {
        String sql = """
            INSERT INTO auth_codes (code, player_uuid, player_name, role, created_at, expires_at)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(code) DO UPDATE SET used=0, expires_at=excluded.expires_at
            """;
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, code);
            ps.setString(2, playerUuid);
            ps.setString(3, playerName);
            ps.setString(4, role);
            ps.setLong(5, Instant.now().getEpochSecond());
            ps.setLong(6, expiresAt.getEpochSecond());
            ps.executeUpdate();
        }
    }

    /** コードを検証してセッションを発行する。失敗時は null を返す。 */
    public AuthCodeResult redeem(String code) throws SQLException {
        String sql = "SELECT player_uuid, player_name, role FROM auth_codes WHERE code=? AND used=0 AND expires_at>?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, code);
            ps.setLong(2, Instant.now().getEpochSecond());
            ResultSet rs = ps.executeQuery();
            if (!rs.next()) return null;
            String playerUuid = rs.getString(1);
            String playerName = rs.getString(2);
            String role = rs.getString(3);

            // コードを使用済みにする
            try (PreparedStatement upd = conn.prepareStatement("UPDATE auth_codes SET used=1 WHERE code=?")) {
                upd.setString(1, code);
                upd.executeUpdate();
            }

            // セッション発行
            String token = UUID.randomUUID().toString();
            Instant expiresAt = Instant.now().plusSeconds(7 * 24 * 3600);
            sessionDao.insert(token, playerUuid, playerName, role, expiresAt);
            return new AuthCodeResult(token, playerUuid, playerName, role);
        }
    }
}
