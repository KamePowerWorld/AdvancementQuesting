package com.kamesuta.advquesting.api;

import static com.kamesuta.advquesting.api.ApiSupport.parseId;

import com.kamesuta.advquesting.data.Quest;
import com.kamesuta.advquesting.data.QuestManager;
import com.kamesuta.advquesting.db.ProposalDao;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.BadRequestResponse;
import io.javalin.http.ForbiddenResponse;
import io.javalin.http.NotFoundResponse;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ProposalRoutes {

    private final ProposalDao proposalDao;
    private final QuestManager questManager;
    private final SessionDao sessionDao;

    public ProposalRoutes(ProposalDao proposalDao, QuestManager questManager, SessionDao sessionDao) {
        this.proposalDao = proposalDao;
        this.questManager = questManager;
        this.sessionDao = sessionDao;
    }

    public void register(Javalin app) {

        // GET /api/proposals — 提案一覧 (questSnapshot + myVote 付き)
        app.get("/api/proposals", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            List<ProposalDao.ProposalRecord> proposals = proposalDao.findAll();
            List<Map<String, Object>> result = new ArrayList<>();
            for (ProposalDao.ProposalRecord p : proposals) {
                Quest quest = questManager.findById(p.questId());
                String myVote = proposalDao.getMyVote(p.id(), session.playerUuid());
                result.add(toResponse(p, quest, myVote));
            }
            ctx.json(result);
        });

        // POST /api/proposals — 提案投稿 (全ロール)
        app.post("/api/proposals", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            Quest body = ctx.bodyAsClass(Quest.class);
            body.status = "proposed";
            body.creatorUuid = session.playerUuid();
            Quest created = questManager.create(body);
            ProposalDao.ProposalRecord proposal = proposalDao.create(
                created.id, session.playerUuid(), session.playerName()
            );
            ctx.status(201).json(toResponse(proposal, created, null));
        });

        // DELETE /api/proposals/:id — 取り下げ (自分の提案 or editor)
        app.delete("/api/proposals/{id}", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            int id = parseId(ctx.pathParam("id"));
            ProposalDao.ProposalRecord proposal = proposalDao.findById(id);
            if (proposal == null) throw new NotFoundResponse();
            if (!session.isEditor() && !session.playerUuid().equals(proposal.proposerUuid())) {
                throw new ForbiddenResponse();
            }
            proposalDao.delete(id);
            // 関連クエスト (proposed状態) も削除
            Quest quest = questManager.findById(proposal.questId());
            if (quest != null && "proposed".equals(quest.status)) {
                questManager.delete(proposal.questId());
            }
            ctx.status(204);
        });

        // POST /api/proposals/:id/vote — 投票
        app.post("/api/proposals/{id}/vote", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            int id = parseId(ctx.pathParam("id"));
            Map<?, ?> body = ctx.bodyAsClass(Map.class);
            String type = (String) body.get("type");
            if (!"up".equals(type) && !"down".equals(type)) throw new BadRequestResponse("type must be up or down");
            if (proposalDao.findById(id) == null) throw new NotFoundResponse();
            String myVote = proposalDao.vote(id, session.playerUuid(), type);
            ctx.json(Map.of("myVote", myVote != null ? myVote : ""));
        });

        // POST /api/proposals/:id/approve — 承認 (editor以上)
        app.post("/api/proposals/{id}/approve", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            if (!session.isEditor()) throw new ForbiddenResponse();
            int id = parseId(ctx.pathParam("id"));
            ProposalDao.ProposalRecord proposal = proposalDao.findById(id);
            if (proposal == null) throw new NotFoundResponse();
            boolean ok = proposalDao.approve(id);
            if (!ok) throw new BadRequestResponse("Already processed");
            // クエストを public に変更し提案者名を保存
            Quest patch = new Quest();
            patch.status = "public";
            patch.creatorName = proposal.proposerName();
            questManager.update(proposal.questId(), patch);
            ctx.json(Map.of("status", "approved"));
        });

        // POST /api/proposals/:id/reject — 却下 (editor以上)
        app.post("/api/proposals/{id}/reject", ctx -> {
            SessionDao.SessionInfo session = AuthMiddleware.requireAuth(ctx, sessionDao);
            if (!session.isEditor()) throw new ForbiddenResponse();
            int id = parseId(ctx.pathParam("id"));
            ProposalDao.ProposalRecord proposal = proposalDao.findById(id);
            if (proposal == null) throw new NotFoundResponse();
            Map<?, ?> body = ctx.bodyAsClass(Map.class);
            Object reasonObj = body.get("reason");
            String reason = reasonObj instanceof String s ? s : "";
            boolean ok = proposalDao.reject(id, reason);
            if (!ok) throw new BadRequestResponse("Already processed");
            // クエストを hidden に変更
            Quest patch = new Quest();
            patch.status = "hidden";
            questManager.update(proposal.questId(), patch);
            ctx.json(Map.of("status", "rejected"));
        });
    }

    /** 提案レコード (+ 対応クエストのスナップショット) を API レスポンス形式へ変換する */
    private Map<String, Object> toResponse(ProposalDao.ProposalRecord p, Quest quest, String myVote) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", p.id());
        map.put("questId", p.questId());
        map.put("proposerUuid", p.proposerUuid());
        map.put("proposerName", p.proposerName());
        map.put("status", p.status());
        map.put("votesUp", p.votesUp());
        map.put("votesDown", p.votesDown());
        map.put("rejectReason", p.rejectReason());
        map.put("createdAt", p.createdAt());
        map.put("myVote", myVote);
        if (quest != null) {
            map.put("mapPosition", quest.mapPosition);
            Map<String, Object> snapshot = new HashMap<>();
            snapshot.put("title", quest.title != null ? quest.title : "");
            snapshot.put("subtitle", quest.subtitle != null ? quest.subtitle : "");
            snapshot.put("description", quest.description != null ? quest.description : "");
            snapshot.put("icon", quest.icon != null ? quest.icon : "");
            snapshot.put("prerequisites", quest.prerequisites != null ? quest.prerequisites : List.of());
            snapshot.put("conditions", quest.conditions != null ? quest.conditions : List.of());
            snapshot.put("rewards", quest.rewards != null ? quest.rewards : List.of());
            map.put("questSnapshot", snapshot);
        }
        return map;
    }
}
