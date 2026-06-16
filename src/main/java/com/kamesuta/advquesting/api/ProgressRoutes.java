package com.kamesuta.advquesting.api;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kamesuta.advquesting.data.ProgressManager;
import com.kamesuta.advquesting.db.ProgressDao;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.BadRequestResponse;
import io.javalin.http.ForbiddenResponse;
import io.javalin.http.NotFoundResponse;

import java.sql.SQLException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class ProgressRoutes {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    private final ProgressDao progressDao;
    private final ProgressManager progressManager;
    private final SessionDao sessionDao;

    public ProgressRoutes(ProgressDao progressDao, ProgressManager progressManager, SessionDao sessionDao) {
        this.progressDao = progressDao;
        this.progressManager = progressManager;
        this.sessionDao = sessionDao;
    }

    public void register(Javalin app) {

        // GET /api/progress — 自分の全進捗
        app.get("/api/progress", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            try {
                List<ProgressDao.ProgressRecord> records = progressDao.findByPlayer(session.playerUuid());
                ctx.json(records.stream().map(this::toMap).toList());
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        });

        // GET /api/progress/:questId — 特定クエストの進捗
        app.get("/api/progress/{questId}", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            int questId = parseId(ctx.pathParam("questId"));
            try {
                ProgressDao.ProgressRecord record = progressDao.findByPlayerAndQuest(session.playerUuid(), questId);
                if (record == null) throw new NotFoundResponse("No progress record");
                ctx.json(toMap(record));
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        });

        // POST /api/progress/:questId/condition/:conditionId/complete — チェックマーク条件を手動完了
        app.post("/api/progress/{questId}/condition/{conditionId}/complete", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            int questId = parseId(ctx.pathParam("questId"));
            String conditionId = ctx.pathParam("conditionId");
            try {
                boolean ok = progressManager.completeCheckmarkCondition(session.playerUuid(), questId, conditionId);
                if (!ok) throw new ForbiddenResponse("Condition not found, not a checkmark, or already completed");
                ctx.json(Map.of("status", "completed"));
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        });

        // POST /api/progress/:questId/claim — 報酬受け取り
        app.post("/api/progress/{questId}/claim", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            int questId = parseId(ctx.pathParam("questId"));
            try {
                boolean ok = progressManager.claimReward(session.playerUuid(), questId);
                if (!ok) throw new ForbiddenResponse("Quest not completed or reward already claimed");
                ctx.json(Map.of("status", "claimed"));
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        });
    }

    private Map<String, Object> toMap(ProgressDao.ProgressRecord r) {
        List<Map<String, Object>> progressList;
        try {
            progressList = MAPPER.readValue(r.progress(), LIST_MAP_TYPE);
        } catch (Exception e) {
            progressList = Collections.emptyList();
        }
        return Map.of(
            "id", r.id(),
            "playerUuid", r.playerUuid(),
            "questId", r.questId(),
            "progress", progressList,
            "completed", r.completed(),
            "rewardClaimed", r.rewardClaimed(),
            "startedAt", r.startedAt(),
            "completedAt", r.completedAt() != null ? r.completedAt() : ""
        );
    }

    private static int parseId(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            throw new BadRequestResponse("Invalid id");
        }
    }
}
