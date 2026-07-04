package com.kamesuta.advquesting.api;

import static com.kamesuta.advquesting.api.ApiSupport.parseId;

import com.kamesuta.advquesting.db.CompletionDao;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * クエストのランキング API。
 *
 * GET /api/quests/{questId}/ranking?type=first|count&limit=&around=&full=
 *   クリア順 (first) / クリア回数 (count) ランキングを返す。
 *   認証は任意 (未ログインでも閲覧可。ログイン時は me / around を埋める)。
 */
public class RankingRoutes {

    private static final int DEFAULT_LIMIT = 10;
    private static final int DEFAULT_AROUND = 1;

    private final CompletionDao completionDao;
    private final SessionDao sessionDao;

    public RankingRoutes(CompletionDao completionDao, SessionDao sessionDao) {
        this.completionDao = completionDao;
        this.sessionDao = sessionDao;
    }

    public void register(Javalin app) {
        app.get("/api/quests/{questId}/ranking", ctx -> {
            int questId = parseId(ctx.pathParam("questId"));
            String type = ctx.queryParam("type");
            if (type == null || !type.equals("count")) type = "first";
            boolean full = "true".equals(ctx.queryParam("full"));
            int limit = parseIntOr(ctx.queryParam("limit"), DEFAULT_LIMIT);
            int around = parseIntOr(ctx.queryParam("around"), DEFAULT_AROUND);

            // 任意認証: トークンがあれば自分の UUID を解決する
            String myUuid = resolveOptionalUuid(ctx.header("Authorization"));

            List<CompletionDao.RankRow> rows = "count".equals(type)
                ? completionDao.countRanking(questId)
                : completionDao.firstClearRanking(questId);

            // rank を連番付与 (同数同着は先着優先の単純連番)
            List<Map<String, Object>> all = new ArrayList<>(rows.size());
            int myIndex = -1;
            for (int i = 0; i < rows.size(); i++) {
                CompletionDao.RankRow r = rows.get(i);
                boolean isMe = myUuid != null && myUuid.equals(r.playerUuid());
                if (isMe) myIndex = i;
                all.add(entry(i + 1, r, isMe));
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("type", type);
            result.put("questId", questId);
            result.put("totalPlayers", all.size());

            if (full) {
                result.put("top", all);
                result.put("around", List.of());
            } else {
                List<Map<String, Object>> top = all.subList(0, Math.min(limit, all.size()));
                result.put("top", new ArrayList<>(top));
                // 自分が top 圏外なら周辺 ±around を返す
                List<Map<String, Object>> aroundList = new ArrayList<>();
                if (myIndex >= limit) {
                    int from = Math.max(0, myIndex - around);
                    int to = Math.min(all.size(), myIndex + around + 1);
                    aroundList.addAll(all.subList(from, to));
                }
                result.put("around", aroundList);
            }

            // me サマリ
            if (myIndex >= 0) {
                CompletionDao.RankRow me = rows.get(myIndex);
                Map<String, Object> meMap = new LinkedHashMap<>();
                meMap.put("rank", myIndex + 1);
                meMap.put("clears", me.clears());
                meMap.put("completedAt", me.firstAt());
                result.put("me", meMap);
            } else {
                result.put("me", null);
            }

            ctx.json(result);
        });
    }

    private Map<String, Object> entry(int rank, CompletionDao.RankRow r, boolean isMe) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rank", rank);
        m.put("playerUuid", r.playerUuid());
        m.put("playerName", r.playerName());
        m.put("completedAt", r.firstAt());
        m.put("clears", r.clears());
        if (isMe) m.put("isMe", true);
        return m;
    }

    private String resolveOptionalUuid(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        try {
            SessionDao.SessionInfo s = sessionDao.findByToken(authHeader.substring(7));
            return s != null ? s.playerUuid() : null;
        } catch (SQLException e) {
            return null;
        }
    }


    private static int parseIntOr(String s, int fallback) {
        if (s == null) return fallback;
        try {
            int v = Integer.parseInt(s);
            return v > 0 ? v : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
