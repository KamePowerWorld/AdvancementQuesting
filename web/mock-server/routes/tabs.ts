import { Router } from 'express'
import { db } from '../db/client.js'
import { questTabs, quests } from '../db/schema.js'
import { asc, eq, sql } from 'drizzle-orm'
import type { AuthRequest } from '../middleware/auth.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', async (_req, res) => {
  const rows = await db.select().from(questTabs).orderBy(asc(questTabs.sortOrder))
  res.json(rows)
})

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  if (req.playerRole !== 'editor' && req.playerRole !== 'admin') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const { name } = req.body as { name?: string }
  const trimmed = name?.trim()
  if (!trimmed) {
    res.status(400).json({ error: 'Tab name is required' })
    return
  }

  const exists = await db.select().from(questTabs).where(eq(questTabs.name, trimmed)).get()
  if (exists) {
    res.status(409).json({ error: 'Tab already exists' })
    return
  }

  const maxOrderRow = await db.select({ max: sql<number>`coalesce(max(${questTabs.sortOrder}), -1)` }).from(questTabs).get()
  const created = {
    name: trimmed,
    sortOrder: (maxOrderRow?.max ?? -1) + 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await db.insert(questTabs).values(created)
  res.status(201).json(created)
})

router.put('/reorder', requireAuth, async (req: AuthRequest, res) => {
  if (req.playerRole !== 'editor' && req.playerRole !== 'admin') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const { names } = req.body as { names?: string[] }
  if (!Array.isArray(names)) {
    res.status(400).json({ error: 'names must be an array' })
    return
  }

  for (const [index, name] of names.entries()) {
    await db.update(questTabs)
      .set({ sortOrder: index, updatedAt: new Date() })
      .where(eq(questTabs.name, name))
  }

  const rows = await db.select().from(questTabs).orderBy(asc(questTabs.sortOrder))
  res.json(rows)
})

router.delete('/:name', requireAuth, async (req: AuthRequest, res) => {
  if (req.playerRole !== 'editor' && req.playerRole !== 'admin') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const name = String(req.params['name'] ?? '')
  await db.delete(questTabs).where(eq(questTabs.name, name))
  await db.update(quests).set({ category: null, updatedAt: new Date() }).where(eq(quests.category, name))
  res.status(204).send()
})

export default router
