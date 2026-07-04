package com.kamesuta.advquesting.db;

import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.function.Function;

/**
 * クリアログ (quest_completions) の DAO。
 * 1クリア=1レコードで追記し、ランキングを集計する。
 */
public class CompletionDao extends BaseDao {

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

    /** 移行対象1行 (migrateFromProgress 用)。 */
    private record MigrationTarget(String playerUuid, int questId, String completedAt) {}

    public CompletionDao(DatabaseManager db) {
        super(db);
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
    public int migrateFromProgress(Function<String, String> nameResolver) throws SQLException {
        // 取得した行を先に集めてから挿入する (同一 Statement の ResultSet を開いたまま insert しないため)
        List<MigrationTarget> targets = queryList("""
            SELECT pp.player_uuid AS uuid, pp.quest_id AS qid, pp.completed_at AS cat
            FROM player_progress pp
            WHERE pp.completed = 1
              AND NOT EXISTS (
                  SELECT 1 FROM quest_completions qc
                  WHERE qc.player_uuid = pp.player_uuid AND qc.quest_id = pp.quest_id
              )
            """,
            rs -> new MigrationTarget(rs.getString("uuid"), rs.getInt("qid"), rs.getString("cat")));

        int migrated = 0;
        for (MigrationTarget t : targets) {
            String completedAt = (t.completedAt() == null || t.completedAt().isEmpty())
                ? Instant.now().toString() : t.completedAt();
            String name = t.playerUuid();
            if (nameResolver != null) {
                try {
                    String resolved = nameResolver.apply(t.playerUuid());
                    if (resolved != null && !resolved.isEmpty()) name = resolved;
                } catch (Exception ignored) {}
            }
            insert(t.playerUuid(), name, t.questId(), completedAt);
            migrated++;
        }
        return migrated;
    }

    /** クリアログを1件追記する。 */
    public void insert(String playerUuid, String playerName, int questId, String completedAt) throws SQLException {
        update("INSERT INTO quest_completions (player_uuid, player_name, quest_id, completed_at) VALUES (?, ?, ?, ?)",
            playerUuid, playerName, questId, completedAt);
    }

    /**
     * 最近のアクティビティ (個人タイムライン)。新しい順 (id DESC)。
     * カーソルページング: beforeId より小さい id のものを limit 件返す。
     * beforeId が 0 以下なら最新から。
     */
    public List<ActivityRow> recentByPlayer(String playerUuid, int limit, long beforeId) throws SQLException {
        return queryList("""
            SELECT id, quest_id, completed_at
            FROM quest_completions
            WHERE player_uuid = ? AND (? <= 0 OR id < ?)
            ORDER BY id DESC
            LIMIT ?
            """,
            rs -> new ActivityRow(rs.getLong("id"), rs.getInt("quest_id"), rs.getString("completed_at")),
            playerUuid, beforeId, beforeId, limit);
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
        return rankingQuery(sql, questId);
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
        return rankingQuery(sql, questId);
    }

    private List<RankRow> rankingQuery(String sql, int questId) throws SQLException {
        return queryList(sql,
            rs -> new RankRow(
                rs.getString("player_uuid"),
                resolveName(rs.getString("player_uuid")),
                rs.getInt("clears"),
                rs.getString("first_at")
            ), questId);
    }

    /**
     * 最新の表示名を取得する (最後にクリアしたときに記録した名前)。
     * 改名されていても直近のログの名前を使う。
     */
    private String resolveName(String playerUuid) throws SQLException {
        String name = queryOne(
            "SELECT player_name FROM quest_completions WHERE player_uuid = ? ORDER BY completed_at DESC LIMIT 1",
            rs -> rs.getString(1), playerUuid);
        return name != null ? name : playerUuid;
    }
}
