package com.kamesuta.advquesting.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kamesuta.advquesting.api.NotificationRoutes;
import com.kamesuta.advquesting.db.ProgressDao;
import org.bukkit.plugin.java.JavaPlugin;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

/**
 * 毎分実行されるスケジューラ。schedule / cooldown タイプの繰り返しクエストを復活させ SSE で通知する。
 */
public class RepeatScheduler {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> LIST_MAP_TYPE = new TypeReference<>() {};

    private final QuestManager questManager;
    private final ProgressManager progressManager;
    private final ProgressDao progressDao;
    private final NotificationRoutes notificationRoutes;
    private final Logger log;
    private ScheduledExecutorService executor;

    public RepeatScheduler(JavaPlugin plugin, QuestManager questManager, ProgressManager progressManager,
                           ProgressDao progressDao, NotificationRoutes notificationRoutes) {
        this.questManager = questManager;
        this.progressManager = progressManager;
        this.progressDao = progressDao;
        this.notificationRoutes = notificationRoutes;
        this.log = plugin.getLogger();
    }

    public void start() {
        executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "repeat-scheduler");
            t.setDaemon(true);
            return t;
        });
        long nowSec = System.currentTimeMillis() / 1000;
        long delay = 60 - (nowSec % 60);
        executor.scheduleAtFixedRate(this::tick, delay, 60, TimeUnit.SECONDS);
    }

    public void stop() {
        if (executor != null) executor.shutdownNow();
    }

    private void tick() {
        try {
            List<Quest> quests = questManager.loadAll();
            for (Quest quest : quests) {
                if (!"public".equals(quest.status)) continue;
                Quest.RepeatConfig repeat = quest.repeat;
                if (repeat == null) continue;
                boolean isSchedule = "schedule".equals(repeat.type) && repeat.cron != null;
                boolean isCooldown = "cooldown".equals(repeat.type) && repeat.cooldownHours > 0;
                if (!isSchedule && !isCooldown) continue;

                List<ProgressDao.ProgressRecord> records = progressDao.findByQuest(quest.id);
                for (ProgressDao.ProgressRecord rec : records) {
                    if (!rec.completed()) continue;
                    String lastCompletedAt = rec.completedAt();
                    if (lastCompletedAt == null) continue;

                    Instant lastCompleted = Instant.parse(lastCompletedAt);
                    if (shouldRevive(repeat, lastCompleted, Instant.now())) {
                        resetRecord(quest, rec);
                    }
                }
            }
        } catch (Exception e) {
            log.warning("RepeatScheduler tick error: " + e.getMessage());
        }
    }

    /**
     * 完了済みレコードを復活させるべきか判定する。
     * schedule: 最終完了が直近の cron 発火より前なら復活。
     * cooldown: 最終完了から cooldownHours 経過していれば復活。
     */
    static boolean shouldRevive(Quest.RepeatConfig repeat, Instant lastCompleted, Instant now) {
        if ("schedule".equals(repeat.type)) {
            if (repeat.cron == null) return false;
            ZonedDateTime prevFire = CronParser.prevFire(repeat.cron, now.atZone(ZoneId.systemDefault()));
            return prevFire != null && lastCompleted.isBefore(prevFire.toInstant());
        }
        if ("cooldown".equals(repeat.type)) {
            if (repeat.cooldownHours <= 0) return false;
            Instant reviveAt = lastCompleted.plusSeconds(Math.round(repeat.cooldownHours * 3600));
            return !now.isBefore(reviveAt);
        }
        return false;
    }

    /** stat/scoreboard 条件の rawValue を baseValue として引き継いで進捗をリセットし、SSE 通知する。 */
    private void resetRecord(Quest quest, ProgressDao.ProgressRecord rec) throws Exception {
        List<Map<String, Object>> completedProgress;
        try {
            completedProgress = MAPPER.readValue(rec.progress(), LIST_MAP_TYPE);
        } catch (Exception ex) {
            completedProgress = new ArrayList<>();
        }
        String newProgressJson;
        try {
            newProgressJson = ProgressUpdater.buildResetProgressJson(quest, completedProgress);
        } catch (Exception ex) {
            newProgressJson = "[]";
        }
        progressDao.resetForRepeatWithProgress(rec.playerUuid(), quest.id, newProgressJson);
        progressManager.invalidateProgressCache(rec.playerUuid(), quest.id);
        notificationRoutes.sendRepeatReset(rec.playerUuid(), quest.id);
    }
}
