import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './db/client.js'

import authRoutes from './routes/auth.js'
import questRoutes from './routes/quests.js'
import rankingRoutes from './routes/ranking.js'
import progressRoutes from './routes/progress.js'
import playerRoutes from './routes/players.js'
import proposalRoutes from './routes/proposals.js'
import configRoutes from './routes/config.js'
import { playerSessions, authCodes, questProposals, proposalVotes, quests, playerProgress, questCompletions, rewardClaims } from './db/schema.js'
import { eq } from 'drizzle-orm'
import { insertQuestRewards } from './rewardLog.js'

config()

// 起動時に自動マイグレーション
migrate(db, { migrationsFolder: './mock-server/db/migrations' })

// 既存の完了済み進捗をクリアログへ初回移行する (冪等)。
// 本番 (AdvancementQuesting.onEnable) と同じく初回1クリアのみ。
await migrateCompletionsFromProgress()
// 既存の「クリア済み&受取済み」進捗を報酬受取ログへ初回移行する (冪等)。
await migrateRewardsFromProgress()

const app = express()
const port = parseInt(process.env.MOCK_PORT ?? '3000', 10)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/quests', rankingRoutes)
app.use('/api/quests', questRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/players', playerRoutes)
app.use('/api/proposals', proposalRoutes)
app.use('/api/config', configRoutes)

// ヘルスチェック
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// GET /favicon.png — プラグインフォルダの favicon.png を返す (モック: 最小 PNG を返す)
const MOCK_FAVICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
app.get('/favicon.png', (_req, res) => {
  res.set('Content-Type', 'image/png')
  res.send(MOCK_FAVICON_PNG)
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
  const { playerUuid, questId, completed, rewardClaimed, pendingRewards, completedCount } = req.body as {
    playerUuid: string; questId: number; completed: boolean; rewardClaimed?: boolean
    pendingRewards?: number; completedCount?: number
  }
  await db.insert(playerProgress).values({
    playerUuid, questId, progress: [], completed: !!completed, rewardClaimed: !!rewardClaimed,
    pendingRewards: pendingRewards ?? 0, completedCount: completedCount ?? 0,
  }).onConflictDoUpdate({
    target: [playerProgress.playerUuid, playerProgress.questId],
    set: {
      completed: !!completed, rewardClaimed: !!rewardClaimed,
      pendingRewards: pendingRewards ?? 0, completedCount: completedCount ?? 0,
    },
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

// テスト用: クリアログを投入する (ランキング検証用)
// body: { questId, entries: [{ playerUuid, playerName, completedAt }] } または単体
app.post('/api/test/add-completion', async (req, res) => {
  const { questId, entries, playerUuid, playerName, completedAt } = req.body as {
    questId: number
    entries?: Array<{ playerUuid: string; playerName: string; completedAt: string }>
    playerUuid?: string; playerName?: string; completedAt?: string
  }
  const list = entries ?? [{ playerUuid: playerUuid!, playerName: playerName!, completedAt: completedAt! }]
  for (const e of list) {
    await db.insert(questCompletions).values({
      questId, playerUuid: e.playerUuid, playerName: e.playerName, completedAt: e.completedAt,
    })
  }
  res.json({ ok: true, inserted: list.length })
})

// テスト用: クリアログをすべて削除
app.post('/api/test/reset-completions', async (_req, res) => {
  await db.delete(questCompletions)
  res.json({ ok: true })
})

// テスト用: 既存進捗からクリアログへの移行を手動実行する (起動時移行の検証用)
app.post('/api/test/migrate-completions', async (_req, res) => {
  await migrateCompletionsFromProgress()
  res.json({ ok: true })
})

// テスト用: 報酬受取ログを投入する (トータル獲得報酬の検証用)
// body: { questId, questTitle, playerUuid, playerName, rewards: [...], source? }
app.post('/api/test/add-reward-claim', async (req, res) => {
  const { questId, questTitle, playerUuid, playerName, rewards, source } = req.body as {
    questId: number; questTitle: string; playerUuid: string; playerName: string
    rewards: Array<Record<string, unknown>>; source?: 'claim' | 'migrated'
  }
  await insertQuestRewards(playerUuid, playerName, questId, questTitle, rewards,
    new Date().toISOString(), source ?? 'claim')
  res.json({ ok: true })
})

// テスト用: 報酬受取ログをすべて削除
app.post('/api/test/reset-reward-claims', async (_req, res) => {
  await db.delete(rewardClaims)
  res.json({ ok: true })
})

// テスト用: 既存進捗から報酬受取ログへの移行を手動実行する
app.post('/api/test/migrate-rewards', async (_req, res) => {
  await migrateRewardsFromProgress()
  res.json({ ok: true })
})

// 既存 player_progress (completed) → quest_completions 初回移行 (冪等)
async function migrateCompletionsFromProgress() {
  const completedRows = (await db.select().from(playerProgress)).filter((p) => p.completed)
  if (completedRows.length === 0) return
  const existing = await db.select().from(questCompletions)
  const seen = new Set(existing.map((c) => `${c.playerUuid}:${c.questId}`))
  const sessions = await db.select().from(playerSessions)
  const nameByUuid = new Map(sessions.map((s) => [s.playerUuid, s.playerName]))
  let migrated = 0
  for (const p of completedRows) {
    const key = `${p.playerUuid}:${p.questId}`
    if (seen.has(key)) continue
    seen.add(key)
    await db.insert(questCompletions).values({
      questId: p.questId,
      playerUuid: p.playerUuid,
      playerName: nameByUuid.get(p.playerUuid) ?? p.playerUuid,
      completedAt: (p.completedAt ?? new Date()).toISOString(),
    })
    migrated++
  }
  if (migrated > 0) console.log(`[ranking] migrated ${migrated} existing completion(s)`)
}

// 既存 player_progress (completed=1 AND reward_claimed=1) → reward_claims 初回移行 (冪等)
async function migrateRewardsFromProgress() {
  const rows = (await db.select().from(playerProgress)).filter((p) => p.completed && p.rewardClaimed)
  if (rows.length === 0) return
  // source='migrated' 済みの (uuid, questId) はスキップ
  const existing = (await db.select().from(rewardClaims)).filter((c) => c.source === 'migrated')
  const seen = new Set(existing.map((c) => `${c.playerUuid}:${c.questId}`))
  const sessions = await db.select().from(playerSessions)
  const nameByUuid = new Map(sessions.map((s) => [s.playerUuid, s.playerName]))
  const allQuests = await db.select().from(quests)
  const questById = new Map(allQuests.map((q) => [q.id, q]))
  let migrated = 0
  for (const p of rows) {
    const key = `${p.playerUuid}:${p.questId}`
    if (seen.has(key)) continue
    const quest = questById.get(p.questId)
    const rewards = Array.isArray(quest?.rewards) ? (quest!.rewards as Array<Record<string, unknown>>) : []
    if (!quest || rewards.length === 0) continue // 解決不可・報酬なしはスキップ
    seen.add(key)
    await insertQuestRewards(
      p.playerUuid, nameByUuid.get(p.playerUuid) ?? p.playerUuid,
      p.questId, quest.title, rewards,
      (p.completedAt ?? new Date()).toISOString(), 'migrated',
    )
    migrated++
  }
  if (migrated > 0) console.log(`[rewards] migrated ${migrated} existing claim(s)`)
}

app.listen(port, () => {
  console.log(`Mock server running on http://localhost:${port}`)
})
