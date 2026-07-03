import { describe, it, expect } from 'vitest'
import { nextFire, formatCountdown, cooldownNextFire, formatAbsolute, formatDuration, formatRevivePreview } from './CronParser.js'

// ---------------------------------------------------------------------------
// nextFire
// ---------------------------------------------------------------------------
describe('nextFire', () => {
  it('returns null when the expression does not have exactly 5 fields', () => {
    expect(nextFire('* * * *')).toBeNull()
    expect(nextFire('')).toBeNull()
    expect(nextFire('* * * * * *')).toBeNull()
  })

  it('returns a Date strictly after the from timestamp (never the current minute)', () => {
    // Use a fixed anchor: 2024-01-15 10:30 (Monday)
    const from = new Date('2024-01-15T10:30:00')
    const result = nextFire('* * * * *', from)
    expect(result).not.toBeNull()
    // Must be at least 1 minute later
    expect(result!.getTime()).toBeGreaterThan(from.getTime())
    // Should fire at 10:31
    expect(result!.getHours()).toBe(10)
    expect(result!.getMinutes()).toBe(31)
  })

  it('finds the next match when the cron fires only at a specific hour and minute', () => {
    // Fires at 09:00 every day; from is 09:01 on 2024-01-15 → next is 2024-01-16 09:00
    const from = new Date('2024-01-15T09:01:00')
    const result = nextFire('0 9 * * *', from)
    expect(result).not.toBeNull()
    expect(result!.getDate()).toBe(16)
    expect(result!.getHours()).toBe(9)
    expect(result!.getMinutes()).toBe(0)
  })

  it('handles step syntax (*/15 for every 15 minutes)', () => {
    // From 10:16; next */15 minutes fires at 10:30
    const from = new Date('2024-01-15T10:16:00')
    const result = nextFire('*/15 * * * *', from)
    expect(result).not.toBeNull()
    expect(result!.getHours()).toBe(10)
    expect(result!.getMinutes()).toBe(30)
  })

  it('handles day-of-week filtering (fires only on Monday = 1)', () => {
    // 2024-01-14 is Sunday (day 0); next Monday is 2024-01-15
    const from = new Date('2024-01-14T00:00:00')
    const result = nextFire('0 0 * * 1', from)
    expect(result).not.toBeNull()
    expect(result!.getDay()).toBe(1) // Monday
    expect(result!.getDate()).toBe(15)
  })

  it('returns null for an impossible cron (Feb 30)', () => {
    // Feb 30 never exists — should exhaust the 366-day window and return null
    const from = new Date('2024-01-01T00:00:00')
    const result = nextFire('0 0 30 2 *', from)
    expect(result).toBeNull()
  })

  it('handles range syntax (1-5 = Monday–Friday)', () => {
    // 2024-01-14 is Sunday; expect next weekday at midnight
    const from = new Date('2024-01-14T23:59:00')
    const result = nextFire('0 0 * * 1-5', from)
    expect(result).not.toBeNull()
    const day = result!.getDay()
    expect(day).toBeGreaterThanOrEqual(1)
    expect(day).toBeLessThanOrEqual(5)
  })
})

// ---------------------------------------------------------------------------
// formatCountdown
// ---------------------------------------------------------------------------
describe('formatCountdown', () => {
  it('returns "復活待機中" when nextAt is in the past', () => {
    const past = new Date(Date.now() - 60_000)
    expect(formatCountdown(past)).toBe('復活待機中')
  })

  it('returns "復活待機中" when nextAt equals now (diffMs = 0)', () => {
    const now = new Date()
    expect(formatCountdown(now)).toBe('復活待機中')
  })

  it('returns HH:MM format for differences under 24h on the same day', () => {
    // Construct a nextAt that is exactly 1h 5min from now on the same calendar day
    const now = new Date()
    const nextAt = new Date(now.getTime() + 65 * 60_000) // +65 min
    // Only test when it stays on the same day (safe unless the test runs near midnight)
    if (nextAt.getDate() === now.getDate()) {
      const result = formatCountdown(nextAt)
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    }
  })

  it('appends date (M/D) when nextAt crosses into the next calendar day', () => {
    const now = new Date()
    // Place nextAt far enough into tomorrow
    const nextAt = new Date(now)
    nextAt.setDate(now.getDate() + 1)
    nextAt.setHours(3, 0, 0, 0)
    // This is less than 24 h away only if now is after 03:00; just check format
    const diff = nextAt.getTime() - now.getTime()
    if (diff > 0 && diff < 24 * 60 * 60_000) {
      const result = formatCountdown(nextAt)
      // Should contain a slash date portion
      expect(result).toMatch(/\d{2}:\d{2} \(\d+\/\d+\)/)
    }
  })

  it('returns day-based format (残りXd) for differences >= 24h', () => {
    const nextAt = new Date(Date.now() + 48 * 60 * 60_000 + 60_000) // 2 days + 1 min
    const result = formatCountdown(nextAt)
    expect(result).toMatch(/^残り\d+d/)
  })
})

// ---------------------------------------------------------------------------
// cooldownNextFire
// ---------------------------------------------------------------------------
describe('cooldownNextFire', () => {
  it('returns completedAt + cooldownHours as a Date', () => {
    const completedAt = '2024-01-15T10:00:00Z'
    const result = cooldownNextFire(completedAt, 24)
    const expected = new Date('2024-01-16T10:00:00Z')
    expect(result.getTime()).toBe(expected.getTime())
  })

  it('handles fractional hours correctly (1.5 h = 90 min)', () => {
    const completedAt = '2024-01-15T10:00:00Z'
    const result = cooldownNextFire(completedAt, 1.5)
    expect(result.getTime()).toBe(new Date('2024-01-15T11:30:00Z').getTime())
  })
})

// ---------------------------------------------------------------------------
// formatAbsolute
// ---------------------------------------------------------------------------
describe('formatAbsolute', () => {
  it('returns HH:MM when nextAt is on the same day as from', () => {
    const from = new Date('2024-01-15T10:00:00')
    const nextAt = new Date('2024-01-15T14:30:00')
    expect(formatAbsolute(nextAt, from)).toBe('14:30')
  })

  it('returns M/D HH:MM when nextAt is on a different day', () => {
    const from = new Date('2024-01-15T10:00:00')
    const nextAt = new Date('2024-01-16T09:05:00')
    expect(formatAbsolute(nextAt, from)).toBe('1/16 09:05')
  })
})

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------
describe('formatDuration', () => {
  it('returns "0m" when nextAt is in the past', () => {
    const from = new Date('2024-01-15T10:00:00')
    const nextAt = new Date('2024-01-15T09:00:00')
    expect(formatDuration(nextAt, from)).toBe('0m')
  })

  it('returns only minutes when diff is less than 1 hour', () => {
    const from = new Date('2024-01-15T10:00:00')
    const nextAt = new Date('2024-01-15T10:45:00')
    expect(formatDuration(nextAt, from)).toBe('45m')
  })

  it('returns hours and minutes when diff is between 1 and 24 hours', () => {
    const from = new Date('2024-01-15T10:00:00')
    const nextAt = new Date('2024-01-15T12:30:00')
    expect(formatDuration(nextAt, from)).toBe('2h 30m')
  })

  it('returns days, hours, and minutes for multi-day diff', () => {
    const from = new Date('2024-01-15T10:00:00')
    const nextAt = new Date('2024-01-17T12:30:00')
    expect(formatDuration(nextAt, from)).toBe('2d 2h 30m')
  })

  it('omits zero-valued units (e.g., exactly 1 day → "1d")', () => {
    const from = new Date('2024-01-15T10:00:00')
    const nextAt = new Date('2024-01-16T10:00:00')
    expect(formatDuration(nextAt, from)).toBe('1d')
  })
})

// ---------------------------------------------------------------------------
// formatRevivePreview
// ---------------------------------------------------------------------------
describe('formatRevivePreview', () => {
  it('combines formatAbsolute and formatDuration with the expected template', () => {
    const from = new Date('2024-01-15T10:00:00')
    const nextAt = new Date('2024-01-15T12:30:00')
    // Same day → absolute = "12:30", duration = "2h 30m"
    expect(formatRevivePreview(nextAt, from)).toBe('12:30 に復活 (2h 30m 後)')
  })
})
