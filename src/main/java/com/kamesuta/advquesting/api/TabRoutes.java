package com.kamesuta.advquesting.api;

import com.kamesuta.advquesting.data.Quest;
import com.kamesuta.advquesting.data.QuestManager;
import com.kamesuta.advquesting.data.TabManager;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.BadRequestResponse;
import io.javalin.http.ForbiddenResponse;
import java.util.List;
import java.util.Map;

public class TabRoutes {

    private final TabManager tabManager;
    private final QuestManager questManager;
    private final SessionDao sessionDao;

    public TabRoutes(TabManager tabManager, QuestManager questManager, SessionDao sessionDao) {
        this.tabManager = tabManager;
        this.questManager = questManager;
        this.sessionDao = sessionDao;
    }

    public void register(Javalin app) {
        app.get("/api/tabs", ctx -> ctx.json(tabManager.loadAll()));

        app.post("/api/tabs", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            if (!session.isEditor()) throw new ForbiddenResponse();

            Map<?, ?> body = ctx.bodyAsClass(Map.class);
            String name = body.get("name") instanceof String s ? s.trim() : "";
            if (name.isEmpty()) throw new BadRequestResponse("name required");

            try {
                TabManager.TabRecord created = tabManager.create(name);
                if (created == null) throw new BadRequestResponse("tab already exists");
                ctx.status(201).json(created);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        app.put("/api/tabs/reorder", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            if (!session.isEditor()) throw new ForbiddenResponse();

            Map<?, ?> body = ctx.bodyAsClass(Map.class);
            Object namesObj = body.get("names");
            if (!(namesObj instanceof List<?> rawNames)) throw new BadRequestResponse("names required");
            List<String> names = rawNames.stream().map(String::valueOf).toList();
            try {
                ctx.json(tabManager.reorder(names));
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        app.delete("/api/tabs/{name}", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            if (!session.isEditor()) throw new ForbiddenResponse();

            String name = ctx.pathParam("name");
            try {
                boolean removed = tabManager.delete(name);
                if (removed) {
                    for (Quest quest : questManager.loadAll()) {
                        if (name.equals(quest.category)) {
                            Quest patch = new Quest();
                            patch.category = "";
                            questManager.update(quest.id, patch);
                        }
                    }
                }
                ctx.status(204);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
    }
}
