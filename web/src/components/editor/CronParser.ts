/**
 * 簡易 cron ユーティリティ (フロントエンド用)
 * "分 時 日 月 曜日" の5フィールド形式
 * nextFire: 次の発火時刻を返す (残り時間表示用)
 */

function parseBitSet(field: string, min: number, max: number): Set<number> {
  const s = new Set<number>()
  if (field === '*') {
    for (let i = min; i <= max; i++) s.add(i)
    return s
  }
  for (const part of field.split(',')) {
    if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10)
      for (let i = min; i <= max; i += step) s.add(i)
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number)
      for (let i = lo; i <= hi; i++) s.add(i)
    } else {
      s.add(parseInt(part, 10))
    }
  }
  return s
}

function matches(d: Date, minutes: Set<number>, hours: Set<number>, days: Set<number>, months: Set<number>, dows: Set<number>): boolean {
  // JS: getDay() 0=日, 1=月…6=土 → 同じ
  return minutes.has(d.getMinutes())
    && hours.has(d.getHours())
    && days.has(d.getDate())
    && months.has(d.getMonth() + 1)
    && dows.has(d.getDay())
}

/** 次の発火時刻を返す。最大366日先まで探す。無効な式は null */
export function nextFire(expr: string, from: Date = new Date()): Date | null {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return null
  try {
    const minutes = parseBitSet(fields[0], 0, 59)
    const hours   = parseBitSet(fields[1], 0, 23)
    const days    = parseBitSet(fields[2], 1, 31)
    const months  = parseBitSet(fields[3], 1, 12)
    const dows    = parseBitSet(fields[4], 0, 6)

    // 現在分の次の分から探す
    const t = new Date(from)
    t.setSeconds(0, 0)
    t.setMinutes(t.getMinutes() + 1)

    const limit = new Date(from)
    limit.setDate(limit.getDate() + 366)

    while (t < limit) {
      if (matches(t, minutes, hours, days, months, dows)) return new Date(t)
      t.setMinutes(t.getMinutes() + 1)
    }
    return null
  } catch {
    return null
  }
}

/** 残り時間を "残りXh Ym" / "00:05 (6/20)" 形式に整形する */
export function formatCountdown(nextAt: Date): string {
  const now = new Date()
  const diffMs = nextAt.getTime() - now.getTime()
  if (diffMs <= 0) return '復活待機中'

  const totalMin = Math.floor(diffMs / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60

  // 24時間未満は時分表示 (HH:MM形式 + 日をまたぐなら日付)
  if (h < 24) {
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    const sameDay = nextAt.getDate() === now.getDate()
    if (!sameDay) {
      const mo = nextAt.getMonth() + 1
      const d = nextAt.getDate()
      return `${hh}:${mm} (${mo}/${d})`
    }
    return `${hh}:${mm}`
  }

  // 24時間以上は日時表示
  const days = Math.floor(h / 24)
  const remH = h % 24
  if (remH === 0) return `残り${days}d`
  return `残り${days}d ${remH}h`
}

/** クールダウン残り時間を返す (cooldownHours 後に復活) */
export function cooldownNextFire(completedAt: string, cooldownHours: number): Date {
  const d = new Date(completedAt)
  d.setTime(d.getTime() + cooldownHours * 3600000)
  return d
}

/** 復活時刻を絶対表記 "HH:MM" / 日をまたぐなら "M/D HH:MM" で返す */
export function formatAbsolute(nextAt: Date, from: Date = new Date()): string {
  const hh = String(nextAt.getHours()).padStart(2, '0')
  const mm = String(nextAt.getMinutes()).padStart(2, '0')
  const sameDay = nextAt.getFullYear() === from.getFullYear()
    && nextAt.getMonth() === from.getMonth()
    && nextAt.getDate() === from.getDate()
  if (sameDay) return `${hh}:${mm}`
  return `${nextAt.getMonth() + 1}/${nextAt.getDate()} ${hh}:${mm}`
}

/** 残り時間を相対表記 "Xd Yh Zm" (0の単位は省略) で返す */
export function formatDuration(nextAt: Date, from: Date = new Date()): string {
  const diffMs = nextAt.getTime() - from.getTime()
  if (diffMs <= 0) return '0m'
  const totalMin = Math.floor(diffMs / 60000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || parts.length === 0) parts.push(`${m}m`)
  return parts.join(' ')
}

/** "HH:MM に復活 (Xh Ym 後)" 形式の編集プレビュー文字列を返す */
export function formatRevivePreview(nextAt: Date, from: Date = new Date()): string {
  return `${formatAbsolute(nextAt, from)} に復活 (${formatDuration(nextAt, from)} 後)`
}
