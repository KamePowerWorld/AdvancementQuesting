package com.kamesuta.advquesting.api;

import com.kamesuta.advquesting.db.DashboardConfigDao;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.ForbiddenResponse;

import java.sql.SQLException;

/**
 * ダッシュボード設定 API。
 *
 * GET /api/dashboard        — 認証不要、現在のレイアウト JSON を返す
 * PUT /api/dashboard        — エディター認証必須、レイアウト JSON を保存
 */
public class DashboardRoutes {

    private final DashboardConfigDao dashboardConfigDao;
    private final SessionDao sessionDao;

    public DashboardRoutes(DashboardConfigDao dashboardConfigDao, SessionDao sessionDao) {
        this.dashboardConfigDao = dashboardConfigDao;
        this.sessionDao = sessionDao;
    }

    public void register(Javalin app) {

        app.get("/api/dashboard", ctx -> {
            String json;
            try {
                json = dashboardConfigDao.getConfigJson();
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
            ctx.contentType("application/json").result(json);
        });

        app.put("/api/dashboard", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            if (!"editor".equals(session.role()) && !"admin".equals(session.role())) {
                throw new ForbiddenResponse("Editor role required");
            }

            String body = ctx.body();
            if (body == null || body.isBlank()) {
                ctx.status(400).json(java.util.Map.of("error", "Invalid dashboard config"));
                return;
            }

            try {
                dashboardConfigDao.setConfigJson(body);
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
            ctx.json(java.util.Map.of("ok", true));
        });
    }
}
