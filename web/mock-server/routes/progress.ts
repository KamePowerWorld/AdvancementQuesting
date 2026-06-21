import { Router } from 'express'
import { db } from '../db/client.js'
import { playerProgress, quests, playerSessions } from '../db/schema.js'
import { and, eq } from 'drizzle-orm'
import type { AuthRequest } from '../middleware/auth.js'
import { requireAuth } from '../middleware/auth.js'
import { insertQuestRewards } from '../rewardLog.js'

const router = Router()

// GET /api/progress
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const rows = await db
    .select()
    .from(playerProgress)
    .where(eq(playerProgress.playerUuid, req.playerUuid!))

  const allQuests = await db.select().from(quests)
  const questById = new Map(allQuests.map((q) => [q.id, q]))

  const enriched = rows.map((row) => {
    const quest = questById.get(row.questId)
    const conditions = Array.isArray(quest?.conditions) ? (quest!.conditions as Array<Record<string, unknown>>) : []

    const progress = Array.isArray(row.progress) ? (row.progress as Array<Record<string, unknown>>) : []

    // stat/scoreboard 条件に required を補完し、current がなければモック値を付与
    const enrichedProgress = progress.map((p) => {
      const cond = conditions.find((c) => c['id'] === p['conditionId'])
      if (!cond) return p
      const type = cond['type'] as string
      if (type === 'stat' || type === 'scoreboard') {
        const required = type === 'stat' ? Number(cond['count'] ?? 1) : Number(cond['score'] ?? 1)
        const current = p['current'] != null ? Number(p['current']) : (p['completed'] ? required : Math.floor(required * 0.3))
        return { ...p, current, required }
      }
      if (type === 'item' || type === 'delivery') {
        const required = Number(cond['count'] ?? 1)
        const current = p['current'] != null ? Number(p['current']) : (p['completed'] ? required : 0)
        return { ...p, current, required }
      }
      return p
    })

    const rewardClaimable = row.completed && !row.rewardClaimed
    return { ...row, progress: enrichedProgress, rewardClaimable }
  })

  res.json(enriched)
})

// GET /api/progress/:questId
router.get('/:questId', requireAuth, async (req: AuthRequest, res) => {
  const questId = parseInt(String(req.params['questId']), 10)
  if (isNaN(questId)) { res.status(400).json({ error: 'Invalid questId' }); return }
  const row = await db
    .select()
    .from(playerProgress)
    .where(
      and(
        eq(playerProgress.playerUuid, req.playerUuid!),
        eq(playerProgress.questId, questId),
      ),
    )
    .get()

  if (!row) {
    res.status(404).json({ error: 'Progress not found' })
    return
  }

  res.json(row)
})

// POST /api/progress/:questId/condition/:conditionId/complete — チェックマーク条件を手動完了
router.post('/:questId/condition/:conditionId/complete', requireAuth, async (req: AuthRequest, res) => {
  const questId = parseInt(String(req.params['questId']), 10)
  const conditionId = String(req.params['conditionId'])
  if (isNaN(questId)) { res.status(400).json({ error: 'Invalid questId' }); return }

  // クエストの条件が checkmark 型か確認
  const quest = await db.select().from(quests).where(eq(quests.id, questId)).get()
  if (!quest) { res.status(404).json({ error: 'Quest not found' }); return }

  const conditions = Array.isArray(quest.conditions) ? quest.conditions as Array<Record<string, unknown>> : []
  const cond = conditions.find((c) => c['id'] === conditionId)
  if (!cond || cond['type'] !== 'checkmark') {
    res.status(403).json({ error: 'Condition not found or not a checkmark' })
    return
  }

  // 進捗を取得して条件を完了にする
  const existing = await db.select().from(playerProgress).where(
    and(eq(playerProgress.playerUuid, req.playerUuid!), eq(playerProgress.questId, questId))
  ).get()

  const progress: Array<Record<string, unknown>> = Array.isArray(existing?.progress)
    ? (existing!.progress as Array<Record<string, unknown>>)
    : []

  const alreadyDone = progress.some((p) => p['conditionId'] === conditionId && p['completed'] === true)
  if (alreadyDone) { res.status(403).json({ error: 'Already completed' }); return }

  const newProgress = progress.filter((p) => p['conditionId'] !== conditionId)
  newProgress.push({ conditionId, completed: true })

  // 全条件完了かチェック
  const allDone = conditions.every((c) => newProgress.some((p) => p['conditionId'] === c['id'] && p['completed'] === true))

  await db.insert(playerProgress).values({
    playerUuid: req.playerUuid!, questId, progress: newProgress, completed: allDone, rewardClaimed: false,
  }).onConflictDoUpdate({
    target: [playerProgress.playerUuid, playerProgress.questId],
    set: { progress: newProgress, completed: allDone },
  })

  res.json({ status: 'completed' })
})

// POST /api/progress/:questId/deliver — 納品 (モック: 全納品タスクを完了にする)
router.post('/:questId/deliver', requireAuth, async (req: AuthRequest, res) => {
  const questId = parseInt(String(req.params['questId']), 10)
  if (isNaN(questId)) { res.status(400).json({ error: 'Invalid questId' }); return }

  const quest = await db.select().from(quests).where(eq(quests.id, questId)).get()
  if (!quest) { res.status(404).json({ error: 'Quest not found' }); return }

  const conditions = Array.isArray(quest.conditions) ? quest.conditions as Array<Record<string, unknown>> : []
  const deliveryConds = conditions.filter((c) => c['type'] === 'delivery')

  const existing = await db.select().from(playerProgress).where(
    and(eq(playerProgress.playerUuid, req.playerUuid!), eq(playerProgress.questId, questId))
  ).get()

  const progress: Array<Record<string, unknown>> = Array.isArray(existing?.progress)
    ? (existing!.progress as Array<Record<string, unknown>>)
    : []

  // モック: 納品タスクを全て完了扱いにする
  const delivered: Record<string, number> = {}
  const newProgress = progress.filter((p) => !deliveryConds.some((c) => c['id'] === p['conditionId']))
  for (const c of deliveryConds) {
    newProgress.push({ conditionId: c['id'], completed: true })
    delivered[String(c['itemType'] ?? 'unknown')] = Number(c['count'] ?? 1)
  }

  const allDone = conditions.every((c) => newProgress.some((p) => p['conditionId'] === c['id'] && p['completed'] === true))

  await db.insert(playerProgress).values({
    playerUuid: req.playerUuid!, questId, progress: newProgress, completed: allDone, rewardClaimed: false,
  }).onConflictDoUpdate({
    target: [playerProgress.playerUuid, playerProgress.questId],
    set: { progress: newProgress, completed: allDone },
  })

  res.json({ delivered, failed: {} })
})

// POST /api/progress/:questId/claim — 報酬受け取り
router.post('/:questId/claim', requireAuth, async (req: AuthRequest, res) => {
  const questId = parseInt(String(req.params['questId']), 10)
  if (isNaN(questId)) { res.status(400).json({ error: 'Invalid questId' }); return }
  const progress = await db
    .select()
    .from(playerProgress)
    .where(
      and(
        eq(playerProgress.playerUuid, req.playerUuid!),
        eq(playerProgress.questId, questId),
      ),
    )
    .get()

  if (!progress) {
    res.status(404).json({ error: 'Progress not found' })
    return
  }

  if (!progress.completed) {
    res.status(400).json({ error: 'Quest not completed yet' })
    return
  }

  if (progress.rewardClaimed) {
    res.status(400).json({ error: 'Reward already claimed' })
    return
  }

  await db
    .update(playerProgress)
    .set({ rewardClaimed: true })
    .where(eq(playerProgress.id, progress.id))

  // モック: 報酬内容を返す
  const quest = await db.select().from(quests).where(eq(quests.id, questId)).get()
  const rewards = Array.isArray(quest?.rewards) ? (quest!.rewards as Array<Record<string, unknown>>) : []

  // 報酬受取ログを追記
  const session = await db.select().from(playerSessions)
    .where(eq(playerSessions.playerUuid, req.playerUuid!)).get()
  const playerName = session?.playerName ?? req.playerUuid!
  await insertQuestRewards(
    req.playerUuid!, playerName, questId, quest?.title ?? `クエスト #${questId}`,
    rewards, new Date().toISOString(), 'claim',
  )

  res.json({ claimed: true, rewards })
})

export default router
