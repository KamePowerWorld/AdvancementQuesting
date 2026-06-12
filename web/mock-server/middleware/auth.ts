import type { Request, Response, NextFunction } from 'express'
import { db } from '../db/client.js'
import { playerSessions } from '../db/schema.js'
import { eq } from 'drizzle-orm'

export interface AuthRequest extends Request {
  playerUuid?: string
  playerName?: string
  playerRole?: 'player' | 'editor' | 'admin'
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = authHeader.slice(7)
  const session = await db
    .select()
    .from(playerSessions)
    .where(eq(playerSessions.sessionToken, token))
    .get()

  if (!session || session.expiresAt < new Date()) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  req.playerUuid = session.playerUuid
  req.playerName = session.playerName
  req.playerRole = session.role
  next()
}
