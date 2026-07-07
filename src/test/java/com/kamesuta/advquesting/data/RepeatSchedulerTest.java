package com.kamesuta.advquesting.data;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

/** {@link RepeatScheduler#shouldRevive} の判定ロジックテスト。 */
class RepeatSchedulerTest {

    private static Quest.RepeatConfig cooldown(double hours) {
        Quest.RepeatConfig r = new Quest.RepeatConfig();
        r.type = "cooldown";
        r.cooldownHours = hours;
        return r;
    }

    @Test
    void cooldown_経過前は復活しない() {
        Instant completed = Instant.parse("2026-07-07T00:00:00Z");
        Instant now = completed.plus(Duration.ofMinutes(59));
        assertFalse(RepeatScheduler.shouldRevive(cooldown(1.0), completed, now));
    }

    @Test
    void cooldown_経過後は復活する() {
        Instant completed = Instant.parse("2026-07-07T00:00:00Z");
        assertTrue(RepeatScheduler.shouldRevive(cooldown(1.0), completed, completed.plus(Duration.ofHours(1))));
        assertTrue(RepeatScheduler.shouldRevive(cooldown(1.0), completed, completed.plus(Duration.ofHours(2))));
    }

    @Test
    void cooldown_小数時間に対応する() {
        Instant completed = Instant.parse("2026-07-07T00:00:00Z");
        // 0.5時間 = 30分
        assertFalse(RepeatScheduler.shouldRevive(cooldown(0.5), completed, completed.plus(Duration.ofMinutes(29))));
        assertTrue(RepeatScheduler.shouldRevive(cooldown(0.5), completed, completed.plus(Duration.ofMinutes(30))));
    }

    @Test
    void cooldown_0以下は復活しない() {
        Instant completed = Instant.parse("2026-07-07T00:00:00Z");
        assertFalse(RepeatScheduler.shouldRevive(cooldown(0), completed, completed.plus(Duration.ofDays(365))));
    }

    @Test
    void none_typeは復活しない() {
        Quest.RepeatConfig r = new Quest.RepeatConfig();
        r.type = "none";
        Instant completed = Instant.parse("2026-07-07T00:00:00Z");
        assertFalse(RepeatScheduler.shouldRevive(r, completed, completed.plus(Duration.ofDays(365))));
    }

    @Test
    void schedule_直近のcron発火より前の完了なら復活する() {
        Quest.RepeatConfig r = new Quest.RepeatConfig();
        r.type = "schedule";
        r.cron = "0 0 * * *"; // 毎日 0:00 (ローカルタイム)
        // 十分過去に完了していれば、直近の発火時刻より前 → 復活
        Instant completed = Instant.parse("2020-01-01T00:00:00Z");
        assertTrue(RepeatScheduler.shouldRevive(r, completed, Instant.parse("2026-07-07T12:00:00Z")));
        // 未来(=直近発火より後)に完了していれば復活しない
        Instant justCompleted = Instant.parse("2026-07-08T00:00:00Z").plus(Duration.ofDays(1));
        assertFalse(RepeatScheduler.shouldRevive(r, justCompleted, Instant.parse("2026-07-07T12:00:00Z")));
    }
}
