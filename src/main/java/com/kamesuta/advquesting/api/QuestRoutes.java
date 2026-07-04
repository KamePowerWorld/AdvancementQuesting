package com.kamesuta.advquesting.api;

import static com.kamesuta.advquesting.api.ApiSupport.parseId;

import com.kamesuta.advquesting.data.AdvancementSyncManager;
import com.kamesuta.advquesting.data.Quest;
import com.kamesuta.advquesting.data.QuestManager;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.ForbiddenResponse;
import io.javalin.http.NotFoundResponse;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

public class QuestRoutes {

    private final QuestManager questManager;
    private final SessionDao sessionDao;
    private final JavaPlugin plugin;
    private final AdvancementSyncManager advancementSyncManager;

    public QuestRoutes(QuestManager questManager, SessionDao sessionDao,
                       JavaPlugin plugin, AdvancementSyncManager advancementSyncManager) {
        this.questManager = questManager;
        this.sessionDao = sessionDao;
        this.plugin = plugin;
        this.advancementSyncManager = advancementSyncManager;
    }

    public void register(Javalin app) {

        // GET /api/quests
        app.get("/api/quests", ctx -> {
            List<Quest> quests = questManager.loadAll();
            String statusFilter = ctx.queryParam("status");
            String categoryFilter = ctx.queryParam("category");
            if (statusFilter != null) {
                quests = quests.stream().filter(q -> statusFilter.equals(q.status)).toList();
            }
            if (categoryFilter != null) {
                quests = quests.stream().filter(q -> categoryFilter.equals(q.category)).toList();
            }
            ctx.json(quests);
        });

        // GET /api/quests/:id
        app.get("/api/quests/{id}", ctx -> {
            int id = parseId(ctx.pathParam("id"));
            Quest quest = questManager.findById(id);
            if (quest == null) throw new NotFoundResponse("Quest not found");
            ctx.json(quest);
        });

        // POST /api/quests — editor 以上
        app.post("/api/quests", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            if (!session.isEditor()) throw new ForbiddenResponse();
            Quest quest = ctx.bodyAsClass(Quest.class);
            quest.creatorUuid = session.playerUuid();
            Quest created = questManager.create(quest);
            Bukkit.getScheduler().runTask(plugin, () -> advancementSyncManager.syncQuest(created));
            ctx.status(201).json(created);
        });

        // PUT /api/quests/:id — editor 以上
        app.put("/api/quests/{id}", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            if (!session.isEditor()) throw new ForbiddenResponse();
            int id = parseId(ctx.pathParam("id"));
            Quest patch = ctx.bodyAsClass(Quest.class);
            Quest updated = questManager.update(id, patch);
            if (updated == null) throw new NotFoundResponse("Quest not found");
            Bukkit.getScheduler().runTask(plugin, () -> advancementSyncManager.syncQuest(updated));
            ctx.json(updated);
        });

        // DELETE /api/quests/:id — editor 以上
        app.delete("/api/quests/{id}", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            if (!session.isEditor()) throw new ForbiddenResponse();
            int id = parseId(ctx.pathParam("id"));
            if (!questManager.delete(id)) throw new NotFoundResponse("Quest not found");
            Bukkit.getScheduler().runTask(plugin, () -> advancementSyncManager.removeQuest(id));
            ctx.status(204);
        });
    }

}
