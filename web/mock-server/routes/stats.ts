import { Router } from 'express'
import { db } from '../db/client.js'

const router = Router()

function parseIntOr(v: unknown, fallback: number): number {
  const n = parseInt(String(v ?? ''), 10)
  return !isNaN(n) && n > 0 ? n : fallback
}

// GET /api/stats/leaderboard?metric=points|completions|scoreboard&limit=10&objective=xxx
router.get('/leaderboard', (req, res) => {
  const metric = (['points', 'completions', 'scoreboard'] as const).includes(req.query['metric'] as 'points')
    ? (req.query['metric'] as 'points' | 'completions' | 'scoreboard')
    : 'points'
  const limit = parseIntOr(req.query['limit'], 10)

  // scoreboard は Java 本番のみ対応。mock では空データを返す
  if (metric === 'scoreboard') {
    res.json({ metric, entries: [] })
    return
  }

  let rows: Array<{ player_uuid: string; player_name: string; total: number }>

  if (metric === 'points') {
    rows = db.$client.prepare(`
      SELECT player_uuid, MAX(player_name) AS player_name, SUM(amount) AS total
      FROM reward_claims
      WHERE reward_type = 'point'
      GROUP BY player_uuid
      ORDER BY total DESC
      LIMIT ?
    `).all(limit) as typeof rows
  } else {
    rows = db.$client.prepare(`
      SELECT player_uuid, MAX(player_name) AS player_name, COUNT(*) AS total
      FROM quest_completions
      GROUP BY player_uuid
      ORDER BY total DESC
      LIMIT ?
    `).all(limit) as typeof rows
  }

  const entries = rows.map((r, i) => ({
    rank: i + 1,
    playerUuid: r.player_uuid,
    playerName: r.player_name,
    value: r.total,
  }))

  res.json({ metric, entries })
})

// GET /api/stats/timeseries?metric=completions|points&days=30
router.get('/timeseries', (req, res) => {
  const metric = req.query['metric'] === 'points' ? 'points' : 'completions'
  const days = parseIntOr(req.query['days'], 30)

  let rows: Array<{ date: string; value: number }>

  if (metric === 'completions') {
    rows = db.$client.prepare(`
      SELECT strftime('%Y-%m-%d', completed_at) AS date, COUNT(*) AS value
      FROM quest_completions
      WHERE completed_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date
      ORDER BY date ASC
    `).all(days) as typeof rows
  } else {
    rows = db.$client.prepare(`
      SELECT strftime('%Y-%m-%d', claimed_at) AS date, SUM(amount) AS value
      FROM reward_claims
      WHERE reward_type = 'point'
        AND claimed_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date
      ORDER BY date ASC
    `).all(days) as typeof rows
  }

  res.json({ metric, days, data: rows })
})

// GET /api/stats/rewards?limit=20
router.get('/rewards', (req, res) => {
  const limit = parseIntOr(req.query['limit'], 20)

  const rows = db.$client.prepare(`
    SELECT reward_type, reward_label, SUM(amount) AS total_amount, COUNT(*) AS claim_count
    FROM reward_claims
    GROUP BY reward_type, reward_label
    ORDER BY total_amount DESC
    LIMIT ?
  `).all(limit) as Array<{ reward_type: string; reward_label: string | null; total_amount: number; claim_count: number }>

  res.json(rows.map((r) => ({
    rewardType: r.reward_type,
    rewardLabel: r.reward_label,
    totalAmount: r.total_amount,
    claimCount: r.claim_count,
  })))
})

// GET /api/stats/quests?sort=popular|hardest&limit=10
router.get('/quests', (req, res) => {
  const sort = req.query['sort'] === 'hardest' ? 'hardest' : 'popular'
  const limit = parseIntOr(req.query['limit'], 10)

  const order = sort === 'popular' ? 'DESC' : 'ASC'
  const rows = db.$client.prepare(`
    SELECT
      qc.quest_id,
      COUNT(*) AS completion_count,
      COUNT(DISTINCT qc.player_uuid) AS unique_players,
      q.title AS quest_title,
      q.icon AS quest_icon
    FROM quest_completions qc
    LEFT JOIN quests q ON q.id = qc.quest_id
    GROUP BY qc.quest_id
    ORDER BY unique_players ${order}, completion_count ${order}
    LIMIT ?
  `).all(limit) as Array<{ quest_id: number; completion_count: number; unique_players: number; quest_title: string | null; quest_icon: string | null }>

  res.json(rows.map((r) => ({
    questId: r.quest_id,
    questTitle: r.quest_title ?? `Quest #${r.quest_id}`,
    questIcon: r.quest_icon ?? 'stone',
    completionCount: r.completion_count,
    uniquePlayers: r.unique_players,
  })))
})

// GET /api/stats/activity?limit=20&before=<id>
router.get('/activity', (req, res) => {
  const limit = parseIntOr(req.query['limit'], 20)
  const before = req.query['before'] != null ? Number(req.query['before']) : null

  const whereClause = before != null && !isNaN(before) ? 'AND qc.id < ?' : ''
  const params: unknown[] = before != null && !isNaN(before) ? [before, limit + 1] : [limit + 1]

  const rows = db.$client.prepare(`
    SELECT
      qc.id,
      qc.player_uuid,
      qc.player_name,
      qc.quest_id,
      qc.completed_at,
      q.title AS quest_title,
      q.icon AS quest_icon,
      GROUP_CONCAT(
        rc.reward_type || ':' || COALESCE(rc.item_type, '') || ':' || rc.amount || ':' || COALESCE(rc.reward_label, ''),
        '|'
      ) AS rewards_raw
    FROM quest_completions qc
    LEFT JOIN quests q ON q.id = qc.quest_id
    LEFT JOIN reward_claims rc ON rc.quest_id = qc.quest_id AND rc.player_uuid = qc.player_uuid
    WHERE 1=1 ${whereClause}
    GROUP BY qc.id
    ORDER BY qc.id DESC
    LIMIT ?
  `).all(...params) as Array<{
    id: number; player_uuid: string; player_name: string; quest_id: number
    completed_at: string; quest_title: string | null; quest_icon: string | null; rewards_raw: string | null
  }>

  const hasMore = rows.length > limit
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => {
    const rewards = r.rewards_raw
      ? r.rewards_raw.split('|').map((seg) => {
          const [type, itemType, amount, label] = seg.split(':')
          return {
            type,
            itemType: itemType || null,
            amount: Number(amount) || 1,
            label: label || null,
          }
        })
      : []
    return {
      id: r.id,
      playerUuid: r.player_uuid,
      playerName: r.player_name,
      questId: r.quest_id,
      questTitle: r.quest_title ?? `Quest #${r.quest_id}`,
      questIcon: r.quest_icon ?? 'stone',
      completedAt: r.completed_at,
      rewards,
    }
  })

  res.json({ items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null })
})

// GET /api/stats/all-rewards
router.get('/all-rewards', (_req, res) => {
  const rows = db.$client.prepare(`
    SELECT
      reward_type,
      item_type,
      MAX(reward_label) AS reward_label,
      SUM(amount) AS total_amount
    FROM reward_claims
    GROUP BY reward_type, COALESCE(item_type, '__none__')
    ORDER BY total_amount DESC
  `).all() as Array<{ reward_type: string; item_type: string | null; reward_label: string | null; total_amount: number }>

  res.json(rows.map((r) => ({
    rewardType: r.reward_type,
    itemType: r.item_type,
    rewardLabel: r.reward_label,
    totalAmount: r.total_amount,
  })))
})

// GET /api/stats/all-rewards/detail?rewardType=xxx&itemType=yyy
router.get('/all-rewards/detail', (req, res) => {
  const rewardType = String(req.query['rewardType'] ?? '')
  const itemType = req.query['itemType'] != null ? String(req.query['itemType']) : null

  const itemCondition = itemType != null
    ? `AND COALESCE(item_type, '__none__') = COALESCE(?, '__none__')`
    : `AND item_type IS NULL`
  const baseParams: unknown[] = itemType != null ? [rewardType, itemType] : [rewardType]

  const players = db.$client.prepare(`
    SELECT player_uuid, MAX(player_name) AS player_name, SUM(amount) AS total_amount
    FROM reward_claims
    WHERE reward_type = ? ${itemCondition}
    GROUP BY player_uuid
    ORDER BY total_amount DESC
    LIMIT 30
  `).all(...baseParams) as Array<{ player_uuid: string; player_name: string; total_amount: number }>

  const quests = db.$client.prepare(`
    SELECT quest_id, MAX(quest_title) AS quest_title, SUM(amount) AS total_amount
    FROM reward_claims
    WHERE reward_type = ? ${itemCondition}
    GROUP BY quest_id
    ORDER BY total_amount DESC
    LIMIT 20
  `).all(...baseParams) as Array<{ quest_id: number; quest_title: string; total_amount: number }>

  res.json({
    players: players.map((p) => ({
      playerUuid: p.player_uuid,
      playerName: p.player_name,
      totalAmount: p.total_amount,
    })),
    quests: quests.map((q) => ({
      questId: q.quest_id,
      questTitle: q.quest_title,
      totalAmount: q.total_amount,
    })),
  })
})

export default router
