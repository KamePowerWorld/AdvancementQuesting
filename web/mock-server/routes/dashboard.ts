import { Router } from 'express'
import { db } from '../db/client.js'
import { dashboardConfigs } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import type { AuthRequest } from '../middleware/auth.js'

const router = Router()
const DEFAULT_KEY = 'default'
const DEFAULT_CONFIG = JSON.stringify({ widgets: [] })

// GET /api/dashboard — 認証不要
router.get('/', async (_req, res) => {
  const row = await db
    .select()
    .from(dashboardConfigs)
    .where(eq(dashboardConfigs.key, DEFAULT_KEY))
    .get()

  const configJson = row?.configJson ?? DEFAULT_CONFIG
  res.json(JSON.parse(configJson))
})

// PUT /api/dashboard — エディター認証必須
router.put('/', requireAuth, async (req: AuthRequest, res) => {
  if (req.playerRole !== 'editor' && req.playerRole !== 'admin') {
    res.status(403).json({ error: 'Editor role required' })
    return
  }

  const body = req.body
  if (!body || typeof body !== 'object' || !Array.isArray(body.widgets)) {
    res.status(400).json({ error: 'Invalid dashboard config' })
    return
  }

  const configJson = JSON.stringify(body)
  await db
    .insert(dashboardConfigs)
    .values({ key: DEFAULT_KEY, configJson, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: dashboardConfigs.key,
      set: { configJson, updatedAt: new Date() },
    })

  res.json({ ok: true })
})

export default router
