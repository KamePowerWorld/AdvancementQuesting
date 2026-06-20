package com.kamesuta.advquesting.db;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * クリアログ (quest_completions) の DAO。
 * 1クリア=1レコードで追記し、ランキングを集計する。
 */
public class CompletionDao {

    /** ランキング1行 (プレイヤー単位に集計済み)。rank はアプリ側で付与する。 */
    public record RankRow(
        String playerUuid,
        String playerName,
        int clears,
        String firstAt   // 初回クリア時刻 (ISO 8601)
    ) {}

    /** アクティビティ1行 (1クリア=1行)。questTitle はアプリ側で解決して付加する。 */
    public record ActivityRow(
        long id,
        int questId,
        String completedAt
    ) {}

    private final DatabaseManager db;

    public CompletionDao(DatabaseManager db) {
        this.db = db;
    }

    /**
     * 既存の player_progress (completed=1) からクリアログを1回だけ移行する。
     * 機能リリース前にクリア済みのプレイヤーをランキングに載せるための初回移行。
     *
     * - 各 (player_uuid, quest_id) について quest_completions が未登録のときだけ
     *   1レコード挿入する（初回1クリアのみ。冪等で再起動しても二重挿入しない）。
     * - completed_at が無い古いレコードは現在時刻で代用する。
     * - player_name は nameResolver(uuid) で解決する（Bukkit のオフライン名解決を注入）。
     *
     * @param nameResolver UUID → 表示名。null/失敗時は UUID をそのまま使う。
     * @return 移行したレコード数
     */
    public int migrateFromProgress(java.util.function.Function<String, String> nameResolver) throws SQLException {
        String sql = """
            SELECT pp.player_uuid AS uuid, pp.quest_id AS qid, pp.completed_at AS cat
            FROM player_progress pp
            WHERE pp.completed = 1
              AND NOT EXISTS (
                  SELECT 1 FROM quest_completions qc
                  WHERE qc.player_uuid = pp.player_uuid AND qc.quest_id = pp.quest_id
              )
            """;
        int migrated = 0;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ResultSet rs = ps.executeQuery();
            while (rs.next()) {
                String uuid = rs.getString("uuid");
                int qid = rs.getInt("qid");
                String completedAt = rs.getString("cat");
                if (completedAt == null || completedAt.isEmpty()) {
                    completedAt = java.time.Instant.now().toString();
                }
                String name = uuid;
                if (nameResolver != null) {
                    try {
                        String resolved = nameResolver.apply(uuid);
                        if (resolved != null && !resolved.isEmpty()) name = resolved;
                    } catch (Exception ignored) {}
                }
                insert(uuid, name, qid, completedAt);
                migrated++;
            }
        }
        return migrated;
    }

    /** クリアログを1件追記する。 */
    public void insert(String playerUuid, String playerName, int questId, String completedAt) throws SQLException {
        String sql = "INSERT INTO quest_completions (player_uuid, player_name, quest_id, completed_at) VALUES (?, ?, ?, ?)";
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ps.setString(2, playerName);
            ps.setInt(3, questId);
            ps.setString(4, completedAt);
            ps.executeUpdate();
        }
    }

    /**
     * 最近のアクティビティ (個人タイムライン)。新しい順 (id DESC)。
     * カーソルページング: beforeId より小さい id のものを limit 件返す。
     * beforeId が 0 以下なら最新から。
     */
    public List<ActivityRow> recentByPlayer(String playerUuid, int limit, long beforeId) throws SQLException {
        String sql = """
            SELECT id, quest_id, completed_at
            FROM quest_completions
            WHERE player_uuid = ? AND (? <= 0 OR id < ?)
            ORDER BY id DESC
            LIMIT ?
            """;
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ps.setLong(2, beforeId);
            ps.setLong(3, beforeId);
            ps.setInt(4, limit);
            ResultSet rs = ps.executeQuery();
            List<ActivityRow> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new ActivityRow(rs.getLong("id"), rs.getInt("quest_id"), rs.getString("completed_at")));
            }
            return rows;
        }
    }

    /**
     * クリア順ランキング: プレイヤーごとの初回クリア時刻が早い順。
     * 各プレイヤーの最新の表示名 (最後にクリアしたときの名前) を採用する。
     */
    public List<RankRow> firstClearRanking(int questId) throws SQLException {
        String sql = """
            SELECT player_uuid,
                   COUNT(*) AS clears,
                   MIN(completed_at) AS first_at,
                   MAX(completed_at) AS last_at
            FROM quest_completions
            WHERE quest_id = ?
            GROUP BY player_uuid
            ORDER BY first_at ASC
            """;
        return query(sql, questId);
    }

    /**
     * クリア回数ランキング: 回数の多い順、同数は初回クリアが早い順。
     */
    public List<RankRow> countRanking(int questId) throws SQLException {
        String sql = """
            SELECT player_uuid,
                   COUNT(*) AS clears,
                   MIN(completed_at) AS first_at,
                   MAX(completed_at) AS last_at
            FROM quest_completions
            WHERE quest_id = ?
            GROUP BY player_uuid
            ORDER BY clears DESC, first_at ASC
            """;
        return query(sql, questId);
    }

    private List<RankRow> query(String sql, int questId) throws SQLException {
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setInt(1, questId);
            ResultSet rs = ps.executeQuery();
            List<RankRow> rows = new ArrayList<>();
            while (rs.next()) {
                rows.add(new RankRow(
                    rs.getString("player_uuid"),
                    resolveName(rs.getString("player_uuid")),
                    rs.getInt("clears"),
                    rs.getString("first_at")
                ));
            }
            return rows;
        }
    }

    /**
     * 最新の表示名を取得する (最後にクリアしたときに記録した名前)。
     * 改名されていても直近のログの名前を使う。
     */
    private String resolveName(String playerUuid) throws SQLException {
        String sql = "SELECT player_name FROM quest_completions WHERE player_uuid = ? ORDER BY completed_at DESC LIMIT 1";
        try (PreparedStatement ps = db.getConnection().prepareStatement(sql)) {
            ps.setString(1, playerUuid);
            ResultSet rs = ps.executeQuery();
            if (rs.next()) return rs.getString(1);
            return playerUuid;
        }
    }
}
