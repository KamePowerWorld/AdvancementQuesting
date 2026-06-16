import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './db/client.js'

import authRoutes from './routes/auth.js'
import questRoutes from './routes/quests.js'
import progressRoutes from './routes/progress.js'
import proposalRoutes from './routes/proposals.js'
import { playerSessions, authCodes, questProposals, proposalVotes, quests, playerProgress } from './db/schema.js'
import { eq } from 'drizzle-orm'

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

// GET /api/player/location — テスト用固定座標を返す
app.get('/api/player/location', (_req, res) => {
  res.json({ x: 100, y: 64, z: 200, dimension: 'overworld' })
})

// SSE: クエスト完了通知ストリーム (token認証)
const sseClients = new Map<string, express.Response[]>()

app.get('/api/notifications/stream', (req, res) => {
  let token = req.headers.authorization?.replace('Bearer ', '') ?? null
  if (!token) token = req.query.token as string ?? null

  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return }

  // モックでは token をそのまま playerUuid として使う (簡易)
  const playerUuid = token
  if (!sseClients.has(playerUuid)) sseClients.set(playerUuid, [])
  sseClients.get(playerUuid)!.push(res)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  res.write('event: connected\ndata: {"ok":true}\n\n')

  req.on('close', () => {
    const list = sseClients.get(playerUuid) ?? []
    const idx = list.indexOf(res)
    if (idx !== -1) list.splice(idx, 1)
  })
})

// テスト用: 指定トークン(playerUuid)へ quest_complete イベントを送信
app.post('/api/test/notify-quest-complete', express.json(), (req, res) => {
  const { token, questId, questTitle, playerName } = req.body as {
    token: string; questId: number; questTitle: string; playerName: string
  }
  const targets = sseClients.get(token) ?? []
  const payload = JSON.stringify({ questId, questTitle, playerUuid: token, playerName })
  for (const client of [...targets]) {
    client.write(`event: quest_complete\ndata: ${payload}\n\n`)
  }
  res.json({ sent: targets.length })
})

// テスト用: 指定トークン(playerUuid)へ progress_update イベントを送信 (演出なし)
app.post('/api/test/notify-progress-update', express.json(), (req, res) => {
  const { token, questId, completed } = req.body as {
    token: string; questId: number; completed: boolean
  }
  const targets = sseClients.get(token) ?? []
  const payload = JSON.stringify({ questId, completed: !!completed, playerUuid: token })
  for (const client of [...targets]) {
    client.write(`event: progress_update\ndata: ${payload}\n\n`)
  }
  res.json({ sent: targets.length })
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

// テスト用: 提案・proposed クエストをすべて削除してクリーンな状態に
app.post('/api/test/reset-proposals', async (_req, res) => {
  await db.delete(proposalVotes)
  await db.delete(questProposals)
  await db.delete(quests).where(eq(quests.status, 'proposed'))
  res.json({ ok: true })
})

// テスト用: 指定プレイヤー・クエストの進捗を完了状態にする
app.post('/api/test/set-progress', express.json(), async (req, res) => {
  const { playerUuid, questId, completed, rewardClaimed } = req.body as {
    playerUuid: string; questId: number; completed: boolean; rewardClaimed?: boolean
  }
  await db.insert(playerProgress).values({
    playerUuid, questId, progress: [], completed: !!completed, rewardClaimed: !!rewardClaimed,
  }).onConflictDoUpdate({
    target: [playerProgress.playerUuid, playerProgress.questId],
    set: { completed: !!completed, rewardClaimed: !!rewardClaimed },
  })
  res.json({ ok: true })
})

// テスト用: 指定プレイヤー・クエストの条件進捗を細かく設定する
app.post('/api/test/set-condition-progress', express.json(), async (req, res) => {
  const { playerUuid, questId, progress, completed, rewardClaimed } = req.body as {
    playerUuid: string
    questId: number
    progress: object[]
    completed?: boolean
    rewardClaimed?: boolean
  }
  await db.insert(playerProgress).values({
    playerUuid, questId, progress, completed: !!completed, rewardClaimed: !!rewardClaimed,
  }).onConflictDoUpdate({
    target: [playerProgress.playerUuid, playerProgress.questId],
    set: { progress, completed: !!completed, rewardClaimed: !!rewardClaimed },
  })
  res.json({ ok: true })
})

// テスト用: 進捗をすべて削除
app.post('/api/test/reset-progress', async (_req, res) => {
  await db.delete(playerProgress)
  res.json({ ok: true })
})

app.listen(port, () => {
  console.log(`Mock server running on http://localhost:${port}`)
})
