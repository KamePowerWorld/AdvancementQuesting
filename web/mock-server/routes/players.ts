import { Router } from 'express'
import { db } from '../db/client.js'
import { playerProgress, questCompletions, quests, rewardClaims } from '../db/schema.js'
import { and, desc, eq, lt } from 'drizzle-orm'

// 任意プレイヤーの公開情報 (view-as 用)。認証不要・全員閲覧可。
const router = Router()

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

// GET /api/players/:uuid/progress — 指定プレイヤーの全進捗
router.get('/:uuid/progress', async (req, res) => {
  const uuid = String(req.params['uuid'])
  const rows = await db
    .select()
    .from(playerProgress)
    .where(eq(playerProgress.playerUuid, uuid))
  res.json(rows)
})

// GET /api/players/:uuid/activity?limit=20&before=<id> — 最近のアクティビティ (カーソルページング)
router.get('/:uuid/activity', async (req, res) => {
  const uuid = String(req.params['uuid'])
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(String(req.query['limit'] ?? ''), 10) || DEFAULT_LIMIT))
  const before = parseInt(String(req.query['before'] ?? ''), 10) || 0

  const where = before > 0
    ? and(eq(questCompletions.playerUuid, uuid), lt(questCompletions.id, before))
    : eq(questCompletions.playerUuid, uuid)

  // 次ページ有無判定のため1件多く取る
  const rows = await db
    .select()
    .from(questCompletions)
    .where(where)
    .orderBy(desc(questCompletions.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  // questTitle / questIcon を解決
  const allQuests = await db.select().from(quests)
  const questById = new Map(allQuests.map((q) => [q.id, q]))

  const items = page.map((r) => {
    const q = questById.get(r.questId)
    return {
      id: r.id,
      questId: r.questId,
      questTitle: q?.title ?? `クエスト #${r.questId}`,
      questIcon: q?.icon ?? 'stone',
      completedAt: r.completedAt,
    }
  })

  res.json({
    playerUuid: uuid,
    items,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  })
})

// GET /api/players/:uuid/rewards — トータル獲得報酬 (type別合計 + 明細)
router.get('/:uuid/rewards', async (req, res) => {
  const uuid = String(req.params['uuid'])
  const rows = await db
    .select()
    .from(rewardClaims)
    .where(eq(rewardClaims.playerUuid, uuid))
    .orderBy(desc(rewardClaims.id))

  const totalsByType: Record<string, number> = {}
  for (const r of rows) {
    totalsByType[r.rewardType] = (totalsByType[r.rewardType] ?? 0) + r.amount
  }

  const items = rows.map((r) => ({
    id: r.id,
    questId: r.questId,
    questTitle: r.questTitle,
    rewardType: r.rewardType,
    rewardLabel: r.rewardLabel,
    itemType: r.itemType,
    amount: r.amount,
    claimedAt: r.claimedAt,
  }))

  res.json({ playerUuid: uuid, totalsByType, items })
})

export default router
