import { Router } from 'express'
import { db } from '../db/client.js'
import { authCodes, playerSessions } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { AuthRequest } from '../middleware/auth.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/code — 6桁コードでセッション確立
router.post('/code', async (req, res) => {
  const { code } = req.body as { code?: string }
  if (!code || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: 'Invalid code format' })
    return
  }

  const authCode = await db
    .select()
    .from(authCodes)
    .where(eq(authCodes.code, code))
    .get()

  if (!authCode || authCode.used || authCode.expiresAt < new Date()) {
    res.status(401).json({ error: 'Invalid or expired code' })
    return
  }

  // コードを使用済みにする
  await db.update(authCodes).set({ used: true }).where(eq(authCodes.code, code))

  // セッション作成 (7日間)
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db.insert(playerSessions).values({
    sessionToken: token,
    playerUuid: authCode.playerUuid,
    playerName: authCode.playerName,
    role: 'player',
    expiresAt,
  })

  res.json({ token, playerUuid: authCode.playerUuid, playerName: authCode.playerName, role: 'player' })
})

// GET /api/auth/me — セッション情報取得
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ playerUuid: req.playerUuid, playerName: req.playerName, role: req.playerRole ?? 'player' })
})

// DELETE /api/auth/logout — ログアウト
router.delete('/logout', requireAuth, async (req: AuthRequest, res) => {
  const token = req.headers.authorization!.slice(7)
  await db.delete(playerSessions).where(eq(playerSessions.sessionToken, token))
  res.status(204).send()
})

export default router
