package com.kamesuta.advquesting.api;

import com.kamesuta.advquesting.data.Quest;
import com.kamesuta.advquesting.data.QuestManager;
import com.kamesuta.advquesting.db.CompletionDao;
import com.kamesuta.advquesting.db.RewardClaimDao;
import io.javalin.Javalin;
import io.javalin.http.BadRequestResponse;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * プレイヤーの公開プロフィール API (view-as 用)。認証不要・全員閲覧可。
 *
 * GET /api/players/{uuid}/activity?limit=20&before=<id>
 *   最近のアクティビティ (個人タイムライン)。カーソルページング。
 * GET /api/players/{uuid}/rewards
 *   トータル獲得報酬 (type別合計 + 明細)。
 */
public class PlayerProfileRoutes {

    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 100;

    private final CompletionDao completionDao;
    private final RewardClaimDao rewardClaimDao;
    private final QuestManager questManager;

    public PlayerProfileRoutes(CompletionDao completionDao, RewardClaimDao rewardClaimDao, QuestManager questManager) {
        this.completionDao = completionDao;
        this.rewardClaimDao = rewardClaimDao;
        this.questManager = questManager;
    }

    public void register(Javalin app) {
        app.get("/api/players/{uuid}/activity", ctx -> {
            String uuid = ctx.pathParam("uuid");
            int limit = clamp(parseIntOr(ctx.queryParam("limit"), DEFAULT_LIMIT), 1, MAX_LIMIT);
            long before = parseLongOr(ctx.queryParam("before"), 0);

            // 次ページ有無の判定のため1件多く取る
            List<CompletionDao.ActivityRow> rows = completionDao.recentByPlayer(uuid, limit + 1, before);

            boolean hasMore = rows.size() > limit;
            List<CompletionDao.ActivityRow> page = hasMore ? rows.subList(0, limit) : rows;

            List<Map<String, Object>> items = new ArrayList<>(page.size());
            for (CompletionDao.ActivityRow r : page) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", r.id());
                m.put("questId", r.questId());
                Quest q = questManager.findById(r.questId());
                m.put("questTitle", (q != null && q.title != null && !q.title.isEmpty()) ? q.title : "クエスト #" + r.questId());
                m.put("questIcon", (q != null && q.icon != null && !q.icon.isEmpty()) ? q.icon : "stone");
                m.put("completedAt", r.completedAt());
                items.add(m);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("playerUuid", uuid);
            result.put("items", items);
            result.put("nextCursor", hasMore ? page.get(page.size() - 1).id() : null);
            ctx.json(result);
        });

        // GET /api/players/{uuid}/rewards — トータル獲得報酬 (type別合計 + 明細)
        app.get("/api/players/{uuid}/rewards", ctx -> {
            String uuid = ctx.pathParam("uuid");

            Map<String, Long> totals = rewardClaimDao.totalsByType(uuid);
            List<RewardClaimDao.ClaimRow> claims = rewardClaimDao.byPlayer(uuid);

            List<Map<String, Object>> items = new ArrayList<>(claims.size());
            for (RewardClaimDao.ClaimRow r : claims) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", r.id());
                m.put("questId", r.questId());
                m.put("questTitle", r.questTitle());
                m.put("rewardType", r.rewardType());
                m.put("rewardLabel", r.rewardLabel());
                m.put("itemType", r.itemType());
                m.put("amount", r.amount());
                m.put("claimedAt", r.claimedAt());
                items.add(m);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("playerUuid", uuid);
            result.put("totalsByType", totals);
            result.put("items", items);
            ctx.json(result);
        });
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
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

    private static long parseLongOr(String s, long fallback) {
        if (s == null) return fallback;
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            throw new BadRequestResponse("Invalid cursor");
        }
    }
}
