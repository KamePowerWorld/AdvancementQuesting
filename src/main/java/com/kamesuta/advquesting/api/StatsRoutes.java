package com.kamesuta.advquesting.api;

import com.kamesuta.advquesting.data.Quest;
import com.kamesuta.advquesting.data.QuestManager;
import com.kamesuta.advquesting.db.StatsDao;
import io.javalin.Javalin;
import org.bukkit.Bukkit;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Score;
import org.bukkit.scoreboard.Scoreboard;

import java.util.*;

/**
 * 全体統計 API。
 *
 * GET /api/stats/leaderboard?metric=points|completions|scoreboard&limit=10&objective=xxx
 * GET /api/stats/timeseries?metric=completions|points&days=30
 * GET /api/stats/rewards?limit=20
 * GET /api/stats/quests?sort=popular|hardest&limit=10
 * GET /api/stats/activity?limit=20&before=<id>
 * GET /api/stats/all-rewards
 * GET /api/stats/all-rewards/detail?rewardType=xxx&itemType=yyy
 */
public class StatsRoutes {

    private final StatsDao statsDao;
    private final QuestManager questManager;

    public StatsRoutes(StatsDao statsDao, QuestManager questManager) {
        this.statsDao = statsDao;
        this.questManager = questManager;
    }

    public void register(Javalin app) {

        app.get("/api/stats/leaderboard", ctx -> {
            String metric = ctx.queryParam("metric");
            if (!"completions".equals(metric) && !"scoreboard".equals(metric)) metric = "points";
            int limit = parseIntOr(ctx.queryParam("limit"), 10);

            if ("scoreboard".equals(metric)) {
                String objective = ctx.queryParam("objective");
                List<Map<String, Object>> entries = new ArrayList<>();
                if (objective != null && !objective.isEmpty()) {
                    Scoreboard sb = Bukkit.getScoreboardManager().getMainScoreboard();
                    Objective obj = sb.getObjective(objective);
                    if (obj != null) {
                        List<Map.Entry<String, Integer>> scores = new ArrayList<>();
                        for (String entry : sb.getEntries()) {
                            Score score = obj.getScore(entry);
                            if (score.isScoreSet()) {
                                scores.add(Map.entry(entry, score.getScore()));
                            }
                        }
                        scores.sort((a, b) -> Integer.compare(b.getValue(), a.getValue()));
                        int rank = 1;
                        for (Map.Entry<String, Integer> e : scores.subList(0, Math.min(limit, scores.size()))) {
                            Map<String, Object> m = new LinkedHashMap<>();
                            m.put("rank", rank++);
                            m.put("playerUuid", e.getKey());
                            m.put("playerName", e.getKey());
                            m.put("value", e.getValue());
                            entries.add(m);
                        }
                    }
                }
                ctx.json(Map.of("metric", metric, "entries", entries));
                return;
            }

            List<StatsDao.LeaderboardEntry> raw = "completions".equals(metric)
                ? statsDao.leaderboardByCompletions(limit)
                : statsDao.leaderboardByPoints(limit);

            List<Map<String, Object>> entries = new ArrayList<>(raw.size());
            for (int i = 0; i < raw.size(); i++) {
                StatsDao.LeaderboardEntry e = raw.get(i);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("rank", i + 1);
                m.put("playerUuid", e.playerUuid());
                m.put("playerName", e.playerName());
                m.put("value", e.value());
                entries.add(m);
            }
            ctx.json(Map.of("metric", metric, "entries", entries));
        });

        app.get("/api/stats/timeseries", ctx -> {
            String metric = "points".equals(ctx.queryParam("metric")) ? "points" : "completions";
            int days = parseIntOr(ctx.queryParam("days"), 30);

            List<StatsDao.TimeseriesPoint> raw = "points".equals(metric)
                ? statsDao.timeseriesPoints(days)
                : statsDao.timeseriesCompletions(days);

            List<Map<String, Object>> data = new ArrayList<>(raw.size());
            for (StatsDao.TimeseriesPoint p : raw) {
                data.add(Map.of("date", p.date(), "value", p.value()));
            }
            ctx.json(Map.of("metric", metric, "days", days, "data", data));
        });

        app.get("/api/stats/rewards", ctx -> {
            int limit = parseIntOr(ctx.queryParam("limit"), 20);
            List<StatsDao.RewardAggEntry> raw = statsDao.rewardsAggregated(limit);

            List<Map<String, Object>> result = new ArrayList<>(raw.size());
            for (StatsDao.RewardAggEntry e : raw) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("rewardType", e.rewardType());
                m.put("rewardLabel", e.rewardLabel());
                m.put("totalAmount", e.totalAmount());
                m.put("claimCount", e.claimCount());
                result.add(m);
            }
            ctx.json(result);
        });

        app.get("/api/stats/quests", ctx -> {
            String sort = "hardest".equals(ctx.queryParam("sort")) ? "hardest" : "popular";
            int limit = parseIntOr(ctx.queryParam("limit"), 10);

            List<StatsDao.QuestStatEntry> raw = "hardest".equals(sort)
                ? statsDao.questStatsByHardest(limit)
                : statsDao.questStatsByPopularity(limit);

            List<Map<String, Object>> result = new ArrayList<>(raw.size());
            for (StatsDao.QuestStatEntry e : raw) {
                Quest quest = questManager.findById(e.questId());
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("questId", e.questId());
                m.put("questTitle", quest != null ? quest.title : "Quest #" + e.questId());
                m.put("questIcon", quest != null && quest.icon != null ? quest.icon : "stone");
                m.put("completionCount", e.completionCount());
                m.put("uniquePlayers", e.uniquePlayers());
                result.add(m);
            }
            ctx.json(result);
        });

        app.get("/api/stats/activity", ctx -> {
            int limit = parseIntOr(ctx.queryParam("limit"), 20);
            String beforeParam = ctx.queryParam("before");
            Long before = null;
            if (beforeParam != null) {
                try { before = Long.parseLong(beforeParam); } catch (NumberFormatException ignored) {}
            }

            StatsDao.GlobalActivityPage page = statsDao.globalActivityPage(limit, before);

            List<Map<String, Object>> result = new ArrayList<>(page.items().size());
            for (StatsDao.GlobalActivityRow r : page.items()) {
                Quest quest = questManager.findById(r.questId());
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", r.id());
                m.put("playerUuid", r.playerUuid());
                m.put("playerName", r.playerName());
                m.put("questId", r.questId());
                m.put("questTitle", quest != null ? quest.title : "Quest #" + r.questId());
                m.put("questIcon", quest != null && quest.icon != null ? quest.icon : "stone");
                m.put("completedAt", r.completedAt());
                m.put("rewards", parseRewards(r.rewardsRaw()));
                result.add(m);
            }
            ctx.json(Map.of("items", result, "nextCursor", page.nextCursor()));
        });

        app.get("/api/stats/all-rewards", ctx -> {
            List<StatsDao.AllRewardsEntry> raw = statsDao.allRewards();
            List<Map<String, Object>> result = new ArrayList<>(raw.size());
            for (StatsDao.AllRewardsEntry e : raw) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("rewardType", e.rewardType());
                m.put("itemType", e.itemType());
                m.put("rewardLabel", e.rewardLabel());
                m.put("totalAmount", e.totalAmount());
                result.add(m);
            }
            ctx.json(result);
        });

        app.get("/api/stats/all-rewards/detail", ctx -> {
            String rewardType = ctx.queryParam("rewardType");
            if (rewardType == null || rewardType.isEmpty()) {
                ctx.status(400).json(Map.of("error", "rewardType is required"));
                return;
            }
            String itemType = ctx.queryParam("itemType");

            List<StatsDao.AllRewardsPlayer> players = statsDao.allRewardsDetailPlayers(rewardType, itemType);
            List<StatsDao.AllRewardsQuest> quests = statsDao.allRewardsDetailQuests(rewardType, itemType);

            List<Map<String, Object>> playerList = new ArrayList<>();
            for (StatsDao.AllRewardsPlayer p : players) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("playerUuid", p.playerUuid());
                m.put("playerName", p.playerName());
                m.put("totalAmount", p.totalAmount());
                playerList.add(m);
            }

            List<Map<String, Object>> questList = new ArrayList<>();
            for (StatsDao.AllRewardsQuest q : quests) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("questId", q.questId());
                m.put("questTitle", q.questTitle() != null ? q.questTitle() : "Quest #" + q.questId());
                m.put("totalAmount", q.totalAmount());
                questList.add(m);
            }

            ctx.json(Map.of("players", playerList, "quests", questList));
        });
    }

    private static List<Map<String, Object>> parseRewards(String raw) {
        if (raw == null || raw.isEmpty()) return List.of();
        List<Map<String, Object>> rewards = new ArrayList<>();
        for (String seg : raw.split("\\|")) {
            String[] parts = seg.split(":", 4);
            if (parts.length < 3) continue;
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("type", parts[0]);
            r.put("itemType", parts[1].isEmpty() ? null : parts[1]);
            r.put("amount", parseLongOr(parts[2], 1));
            r.put("label", parts.length > 3 && !parts[3].isEmpty() ? parts[3] : null);
            rewards.add(r);
        }
        return rewards;
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
            return fallback;
        }
    }
}
