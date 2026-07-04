package com.kamesuta.advquesting.api;

import com.kamesuta.advquesting.db.AuthCodeDao;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.BadRequestResponse;

import java.util.Map;

public class AuthRoutes {

    private final SessionDao sessionDao;
    private final AuthCodeDao authCodeDao;

    public AuthRoutes(SessionDao sessionDao, AuthCodeDao authCodeDao) {
        this.sessionDao = sessionDao;
        this.authCodeDao = authCodeDao;
    }

    public void register(Javalin app) {

        // POST /api/auth/code — 6桁コードでセッション発行
        app.post("/api/auth/code", ctx -> {
            Map<?, ?> body = ctx.bodyAsClass(Map.class);
            String code = (String) body.get("code");
            if (code == null || code.isBlank()) throw new BadRequestResponse("code required");
            AuthCodeDao.AuthCodeResult result = authCodeDao.redeem(code);
            if (result == null) {
                ctx.status(401).json(Map.of("error", "Invalid or expired code"));
                return;
            }
            ctx.json(Map.of(
                "token", result.token(),
                "playerUuid", result.playerUuid(),
                "playerName", result.playerName(),
                "role", result.role()
            ));
        });

        // GET /api/auth/me — セッション情報を返す
        app.get("/api/auth/me", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            ctx.json(Map.of(
                "playerUuid", session.playerUuid(),
                "playerName", session.playerName(),
                "role", session.role()
            ));
        });

        // DELETE /api/auth/logout — セッションを削除
        app.delete("/api/auth/logout", ctx -> {
            String header = ctx.header("Authorization");
            if (header != null && header.startsWith("Bearer ")) {
                sessionDao.delete(header.substring(7));
            }
            ctx.status(204);
        });
    }
}
