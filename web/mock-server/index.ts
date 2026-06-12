import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './db/client.js'

import authRoutes from './routes/auth.js'
import questRoutes from './routes/quests.js'
import progressRoutes from './routes/progress.js'
import proposalRoutes from './routes/proposals.js'
import { playerSessions, authCodes } from './db/schema.js'

config()

// 起動時に自動マイグレーション
migrate(db, { migrationsFolder: './mock-server/db/migrations' })

const app = express()
const port = parseInt(process.env.MOCK_PORT ?? '3000', 10)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/quests', questRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/proposals', proposalRoutes)

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// テスト用: デモセッションを復元する (本番では無効)
app.post('/api/test/restore-sessions', async (_req, res) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db.insert(playerSessions).values([
    { sessionToken: 'demo-session-token-for-development', playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', playerName: 'Steve', role: 'editor' as const, expiresAt },
    { sessionToken: 'demo-editor-token', playerUuid: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', playerName: 'Editor', role: 'editor' as const, expiresAt },
    { sessionToken: 'demo-player-token', playerUuid: 'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa', playerName: 'Alex', role: 'player' as const, expiresAt },
  ]).onConflictDoUpdate({ target: playerSessions.sessionToken, set: { expiresAt } })
  res.json({ ok: true })
})

// テスト用: デモ認証コードをリセットする (used=false, 有効期限を5分延長)
app.post('/api/test/restore-auth-code', async (_req, res) => {
  const codeExpiresAt = new Date(Date.now() + 5 * 60 * 1000)
  await db.insert(authCodes).values({
    code: '123456',
    playerUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    playerName: 'Steve',
    expiresAt: codeExpiresAt,
  }).onConflictDoUpdate({
    target: authCodes.code,
    set: { used: false, expiresAt: codeExpiresAt },
  })
  res.json({ ok: true })
})

app.listen(port, () => {
  console.log(`Mock server running on http://localhost:${port}`)
})
