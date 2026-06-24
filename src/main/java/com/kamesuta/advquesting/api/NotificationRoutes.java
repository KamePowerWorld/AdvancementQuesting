package com.kamesuta.advquesting.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kamesuta.advquesting.db.SessionDao;
import io.javalin.Javalin;
import io.javalin.http.sse.SseClient;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SSE (Server-Sent Events) でクエスト完了通知をブラウザに配信する。
 *
 * GET /api/notifications/stream  — クライアントが接続を維持する
 * イベント種別:
 *   quest_complete  { questId, questTitle, playerUuid, playerName }
 */
public class NotificationRoutes {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** playerUuid → 接続中の SSE クライアント (複数タブ対応) */
    private final Map<String, Set<SseClient>> clients = new ConcurrentHashMap<>();

    private final SessionDao sessionDao;

    public NotificationRoutes(SessionDao sessionDao) {
        this.sessionDao = sessionDao;
    }

    public void register(Javalin app) {
        app.sse("/api/notifications/stream", sseClient -> {
            // 認証: Authorization ヘッダーまたは ?token= クエリ
            String token = sseClient.ctx().header("Authorization");
            if (token != null && token.startsWith("Bearer ")) {
                token = token.substring(7);
            } else {
                token = sseClient.ctx().queryParam("token");
            }
            if (token == null) {
                sseClient.ctx().status(401);
                sseClient.close();
                return;
            }
            SessionDao.SessionInfo session;
            try {
                session = sessionDao.findByToken(token);
            } catch (Exception e) {
                sseClient.ctx().status(401);
                sseClient.close();
                return;
            }
            if (session == null) {
                sseClient.ctx().status(401);
                sseClient.close();
                return;
            }

            // ハンドラを抜けても接続を維持する (これがないと即 close され通知が届かない)
            sseClient.keepAlive();

            String playerUuid = session.playerUuid();
            clients.computeIfAbsent(playerUuid, k -> ConcurrentHashMap.newKeySet()).add(sseClient);

            sseClient.onClose(() ->
                clients.getOrDefault(playerUuid, Set.of()).remove(sseClient)
            );

            // 接続確認用 ping
            sseClient.sendEvent("connected", "{\"ok\":true}");
        });
    }

    /** playerUuid 宛に quest_complete イベントを送信する（達成演出あり） */
    public void sendQuestComplete(String playerUuid, int questId, String questTitle,
                                  String playerName) {
        send(playerUuid, "quest_complete", Map.of(
            "questId", questId,
            "questTitle", questTitle,
            "playerUuid", playerUuid,
            "playerName", playerName
        ));
    }

    /**
     * playerUuid 宛に progress_update イベントを送信する（演出なし・進捗の再取得のみ）。
     */
    public void sendProgressUpdate(String playerUuid, int questId, boolean completed) {
        send(playerUuid, "progress_update", Map.of(
            "questId", questId,
            "completed", completed,
            "playerUuid", playerUuid
        ));
    }

    /**
     * 繰り返しクエストが復活したときに送信する。
     * クライアントは progress を再取得して残り時間表示を更新する。
     */
    public void sendRepeatReset(String playerUuid, int questId) {
        send(playerUuid, "repeat_reset", Map.of(
            "questId", questId,
            "playerUuid", playerUuid
        ));
    }

    /**
     * 全 SSE クライアントを閉じてマップをクリアする。
     * app.stop() の前に呼ぶことで Jetty がクライアント参照を保持しなくなる。
     */
    public void closeAll() {
        for (Set<SseClient> set : clients.values()) {
            for (SseClient c : set) {
                try { c.close(); } catch (Exception ignored) {}
            }
        }
        clients.clear();
    }

    /** 指定プレイヤーの全 SSE クライアントへイベントを送信する共通処理 */
    private void send(String playerUuid, String event, Map<String, Object> payloadMap) {
        Set<SseClient> targets = clients.get(playerUuid);
        if (targets == null || targets.isEmpty()) return;
        try {
            String payload = MAPPER.writeValueAsString(payloadMap);
            for (SseClient c : Set.copyOf(targets)) {
                try {
                    c.sendEvent(event, payload);
                } catch (Exception ignored) {
                    targets.remove(c);
                }
            }
        } catch (Exception e) {
            // ignore serialization errors
        }
    }
}
