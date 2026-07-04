import { Router } from 'express'
import { db } from '../db/client.js'
import { questProposals, proposalVotes, quests } from '../db/schema.js'
import { and, eq, desc, ne } from 'drizzle-orm'
import type { AuthRequest } from '../middleware/auth.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// GET /api/proposals
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const rows = await db
    .select()
    .from(questProposals)
    .where(ne(questProposals.status, 'rejected'))
    .orderBy(desc(questProposals.createdAt))

  // クエスト情報と投票状態を付加
  const withDetails = await Promise.all(
    rows.map(async (p) => {
      const quest = await db
        .select()
        .from(quests)
        .where(eq(quests.id, p.questId))
        .get()
      const myVote = await db
        .select()
        .from(proposalVotes)
        .where(
          and(
            eq(proposalVotes.proposalId, p.id),
            eq(proposalVotes.playerUuid, req.playerUuid!),
          ),
        )
        .get()
      return {
        ...p,
        myVote: myVote?.voteType ?? null,
        mapPosition: quest?.mapPosition ?? null,
        questSnapshot: quest ? {
          title: quest.title,
          description: quest.description,
          icon: quest.icon,
          prerequisites: quest.prerequisites,
          conditions: quest.conditions,
          rewards: quest.rewards,
        } : null,
      }
    }),
  )

  res.json(withDetails)
})

// POST /api/proposals — 提案作成
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  const body = req.body
  const now = new Date()

  // クエストを proposed として作成 (id は AUTOINCREMENT)
  const questResult = await db.insert(quests).values({
    title: body.title ?? '新規提案クエスト',
    description: body.description ?? null,
    icon: body.icon ?? null,
    category: body.category ?? null,
    prerequisites: body.prerequisites ?? [],
    conditions: body.conditions ?? [],
    rewards: body.rewards ?? [],
    mapPosition: body.mapPosition ?? null,
    customButtons: [],
    status: 'proposed',
    creatorUuid: req.playerUuid!,
    createdAt: now,
    updatedAt: now,
  }).returning()

  const proposal = {
    questId: questResult[0].id,
    proposerUuid: req.playerUuid!,
    proposerName: req.playerName!,
    status: 'pending' as const,
    votesUp: 0,
    votesDown: 0,
  }

  const result = await db.insert(questProposals).values(proposal).returning()
  res.status(201).json({ ...result[0], myVote: null })
})

// POST /api/proposals/:id/vote
router.post('/:id/vote', requireAuth, async (req: AuthRequest, res) => {
  const proposalId = parseInt(String(req.params['id']), 10)
  const { type } = req.body as { type: 'up' | 'down' }

  const proposal = await db
    .select()
    .from(questProposals)
    .where(eq(questProposals.id, proposalId))
    .get()

  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' })
    return
  }

  const existing = await db
    .select()
    .from(proposalVotes)
    .where(
      and(
        eq(proposalVotes.proposalId, proposalId),
        eq(proposalVotes.playerUuid, req.playerUuid!),
      ),
    )
    .get()

  if (existing) {
    if (existing.voteType === type) {
      // 同じ投票 → 取り消し
      await db.delete(proposalVotes).where(eq(proposalVotes.id, existing.id))
      const delta = type === 'up' ? { votesUp: proposal.votesUp - 1 } : { votesDown: proposal.votesDown - 1 }
      await db.update(questProposals).set(delta).where(eq(questProposals.id, proposalId))
      res.json({ myVote: null })
      return
    }
    // 投票変更
    await db.update(proposalVotes).set({ voteType: type }).where(eq(proposalVotes.id, existing.id))
    const delta =
      type === 'up'
        ? { votesUp: proposal.votesUp + 1, votesDown: proposal.votesDown - 1 }
        : { votesUp: proposal.votesUp - 1, votesDown: proposal.votesDown + 1 }
    await db.update(questProposals).set(delta).where(eq(questProposals.id, proposalId))
    res.json({ myVote: type })
    return
  }

  // 新規投票
  await db.insert(proposalVotes).values({
    proposalId,
    playerUuid: req.playerUuid!,
    voteType: type,
  })
  const delta = type === 'up' ? { votesUp: proposal.votesUp + 1 } : { votesDown: proposal.votesDown + 1 }
  await db.update(questProposals).set(delta).where(eq(questProposals.id, proposalId))
  res.json({ myVote: type })
})

// POST /api/proposals/:id/approve
router.post('/:id/approve', requireAuth, async (req, res) => {
  const proposalId = parseInt(String(req.params['id']), 10)
  const proposal = await db
    .select()
    .from(questProposals)
    .where(eq(questProposals.id, proposalId))
    .get()

  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' })
    return
  }

  await db
    .update(questProposals)
    .set({ status: 'approved' })
    .where(eq(questProposals.id, proposalId))

  await db
    .update(quests)
    .set({ status: 'public', updatedAt: new Date() })
    .where(eq(quests.id, proposal.questId))

  res.json({ status: 'approved' })
})

// POST /api/proposals/:id/reject
router.post('/:id/reject', requireAuth, async (req, res) => {
  const proposalId = parseInt(String(req.params['id']), 10)
  const { reason } = req.body as { reason?: string }

  const proposal = await db
    .select()
    .from(questProposals)
    .where(eq(questProposals.id, proposalId))
    .get()

  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' })
    return
  }

  await db
    .update(questProposals)
    .set({ status: 'rejected', rejectReason: reason ?? null })
    .where(eq(questProposals.id, proposalId))

  await db
    .update(quests)
    .set({ status: 'hidden', updatedAt: new Date() })
    .where(eq(quests.id, proposal.questId))

  res.json({ status: 'rejected' })
})

// DELETE /api/proposals/:id — 取り下げ (自分の提案 or editor)
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  const proposalId = parseInt(String(req.params['id']), 10)

  const proposal = await db
    .select()
    .from(questProposals)
    .where(eq(questProposals.id, proposalId))
    .get()

  if (!proposal) {
    res.status(404).json({ error: 'Proposal not found' })
    return
  }

  const isEditor = req.playerRole === 'editor' || req.playerRole === 'admin'
  if (!isEditor && req.playerUuid !== proposal.proposerUuid) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  await db.delete(questProposals).where(eq(questProposals.id, proposalId))

  const quest = await db.select().from(quests).where(eq(quests.id, proposal.questId)).get()
  if (quest && quest.status === 'proposed') {
    await db.delete(quests).where(eq(quests.id, proposal.questId))
  }

  res.status(204).send()
})

export default router
