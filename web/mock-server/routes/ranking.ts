import { Router } from 'express'
import { db } from '../db/client.js'
import { questCompletions, playerSessions } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const router = Router()

const DEFAULT_LIMIT = 10
const DEFAULT_AROUND = 1

interface AggRow {
  playerUuid: string
  playerName: string
  clears: number
  firstAt: string
  lastAt: string
}

// GET /api/quests/:questId/ranking?type=first|count&limit=&around=&full=
router.get('/:questId/ranking', async (req, res) => {
  const questId = parseInt(String(req.params['questId']), 10)
  if (isNaN(questId)) { res.status(400).json({ error: 'Invalid questId' }); return }

  const type = req.query['type'] === 'count' ? 'count' : 'first'
  const full = req.query['full'] === 'true'
  const limit = parseIntOr(req.query['limit'], DEFAULT_LIMIT)
  const around = parseIntOr(req.query['around'], DEFAULT_AROUND)

  // 任意認証: トークンがあれば自分の UUID を解決
  const myUuid = await resolveOptionalUuid(req.headers.authorization)

  // クリアログを取得してプレイヤー単位に集計
  const rows = await db.select().from(questCompletions).where(eq(questCompletions.questId, questId))
  const byPlayer = new Map<string, AggRow>()
  for (const r of rows) {
    const cur = byPlayer.get(r.playerUuid)
    if (!cur) {
      byPlayer.set(r.playerUuid, {
        playerUuid: r.playerUuid, playerName: r.playerName,
        clears: 1, firstAt: r.completedAt, lastAt: r.completedAt,
      })
    } else {
      cur.clears += 1
      if (r.completedAt < cur.firstAt) cur.firstAt = r.completedAt
      if (r.completedAt > cur.lastAt) { cur.lastAt = r.completedAt; cur.playerName = r.playerName }
    }
  }

  const agg = [...byPlayer.values()]
  agg.sort((a, b) =>
    type === 'count'
      ? (b.clears - a.clears) || a.firstAt.localeCompare(b.firstAt)
      : a.firstAt.localeCompare(b.firstAt),
  )

  let myIndex = -1
  const all = agg.map((r, i) => {
    const isMe = myUuid != null && myUuid === r.playerUuid
    if (isMe) myIndex = i
    return {
      rank: i + 1,
      playerUuid: r.playerUuid,
      playerName: r.playerName,
      completedAt: r.firstAt,
      clears: r.clears,
      ...(isMe ? { isMe: true } : {}),
    }
  })

  const result: Record<string, unknown> = { type, questId, totalPlayers: all.length }

  if (full) {
    result['top'] = all
    result['around'] = []
  } else {
    result['top'] = all.slice(0, limit)
    const aroundList: typeof all = []
    if (myIndex >= limit) {
      const from = Math.max(0, myIndex - around)
      const to = Math.min(all.length, myIndex + around + 1)
      aroundList.push(...all.slice(from, to))
    }
    result['around'] = aroundList
  }

  result['me'] = myIndex >= 0
    ? { rank: myIndex + 1, clears: agg[myIndex].clears, completedAt: agg[myIndex].firstAt }
    : null

  res.json(result)
})

async function resolveOptionalUuid(authHeader?: string): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const session = await db.select().from(playerSessions).where(eq(playerSessions.sessionToken, token)).get()
  if (!session || session.expiresAt < new Date()) return null
  return session.playerUuid
}

function parseIntOr(v: unknown, fallback: number): number {
  const n = parseInt(String(v ?? ''), 10)
  return !isNaN(n) && n > 0 ? n : fallback
}

export default router
