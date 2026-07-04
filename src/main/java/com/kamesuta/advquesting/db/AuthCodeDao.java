package com.kamesuta.advquesting.db;

import java.sql.SQLException;
import java.time.Instant;
import java.util.UUID;

public class AuthCodeDao extends BaseDao {

    public record AuthCodeResult(String token, String playerUuid, String playerName, String role) {}

    private record CodeRow(String playerUuid, String playerName, String role) {}

    private final SessionDao sessionDao;

    public AuthCodeDao(DatabaseManager db, SessionDao sessionDao) {
        super(db);
        this.sessionDao = sessionDao;
    }

    public void insert(String code, String playerUuid, String playerName, String role, Instant expiresAt) throws SQLException {
        update("""
            INSERT INTO auth_codes (code, player_uuid, player_name, role, created_at, expires_at)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(code) DO UPDATE SET used=0, expires_at=excluded.expires_at
            """, code, playerUuid, playerName, role, Instant.now().getEpochSecond(), expiresAt.getEpochSecond());
    }

    /** コードを検証してセッションを発行する。失敗時は null を返す。 */
    public AuthCodeResult redeem(String code) throws SQLException {
        CodeRow row = queryOne(
            "SELECT player_uuid, player_name, role FROM auth_codes WHERE code=? AND used=0 AND expires_at>?",
            rs -> new CodeRow(rs.getString(1), rs.getString(2), rs.getString(3)),
            code, Instant.now().getEpochSecond());
        if (row == null) return null;

        // コードを使用済みにする
        update("UPDATE auth_codes SET used=1 WHERE code=?", code);

        // セッション発行
        String token = UUID.randomUUID().toString();
        Instant expiresAt = Instant.now().plusSeconds(7 * 24 * 3600);
        sessionDao.insert(token, row.playerUuid(), row.playerName(), row.role(), expiresAt);
        return new AuthCodeResult(token, row.playerUuid(), row.playerName(), row.role());
    }
}
