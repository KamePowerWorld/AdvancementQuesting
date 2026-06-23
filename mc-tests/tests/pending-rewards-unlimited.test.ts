/**
 * 無制限(unlimited)繰り返しクエストの報酬積み上げ E2E テスト
 *
 * 確認内容:
 *  PR-1: unlimited クエストを未受取のまま2回クリアすると pendingRewards が 2 になる
 *  PR-2: 未受取の報酬がある間は rewardClaimable=true（フロントで「★ 報酬を受け取る (×N)」が出る条件）
 *
 * 背景:
 *  unlimited は完了直後に completed=0 へリセットされるため、
 *  rewardClaimable = completed && !rewardClaimed では未受取報酬があっても false になり、
 *  Web UI に「★ 報酬を受け取る (×N)」が表示されない不具合がある。
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const BOT_NAME = 'PrBot' + Math.floor(Math.random() * 100000)

const OBJECTIVE = `test_pr_${Date.now()}`
const REQUIRED_SCORE = 5

interface QuestProgress {
  completed: boolean
  rewardClaimed?: boolean
  rewardClaimable?: boolean
  pendingRewards?: number
  completedCount?: number
}

async function clearOnce(bot: Bot, score: number) {
  const chatPromise = waitForChat(
    bot,
    t => t.includes('クエスト完了') || t.includes('✨'),
    15000,
  ).catch(() => null)
  await rcon(`scoreboard players set ${BOT_NAME} ${OBJECTIVE} ${score}`)
  await new Promise(r => setTimeout(r, 3000))
  return chatPromise
}

describe('unlimited 繰り返しクエストの報酬積み上げ', () => {
  let bot: Bot
  let token: string
  let questId: number
  const condId = `cond-pr-${Date.now()}`

  before(async () => {
    bot = await createBot(BOT_NAME)
    await new Promise(r => setTimeout(r, 1500))

    await rcon(`op ${BOT_NAME}`).catch(() => {})
    await new Promise(r => setTimeout(r, 500))

    // トークン取得
    const chatPromise = waitForChat(bot, t => /\d{6}/.test(t), 8000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)![1]
    const { status, body } = await apiRequest<{ token: string; playerUuid: string }>(
      'POST', '/api/auth/code', { body: { code } },
    )
    assert.equal(status, 200, `認証失敗: ${JSON.stringify(body)}`)
    token = body.token

    // unlimited 繰り返しクエスト（scoreboard条件: REQUIRED_SCORE 点・報酬あり）を作成
    const { status: cs, body: created } = await apiRequest<{ id: number }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `PR報酬積み上げ_${Date.now()}`,
          status: 'public',
          icon: 'paper',
          prerequisites: [],
          conditions: [{
            id: condId,
            type: 'scoreboard',
            objective: OBJECTIVE,
            score: REQUIRED_SCORE,
          }],
          rewards: [{ type: 'item', itemType: 'diamond', count: 1 }],
          repeat: { type: 'unlimited' },
          mapPosition: { x: 920, y: 720 },
          category: null,
          customButtons: [],
        },
      },
    )
    assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
    questId = created.id
    console.log(`テストクエスト作成: id=${questId}, objective=${OBJECTIVE}, repeat=unlimited`)

    await rcon(`scoreboard objectives add ${OBJECTIVE} dummy "PR報酬積み上げ"`).catch(() => {})
    await new Promise(r => setTimeout(r, 500))
    await rcon(`scoreboard players set ${BOT_NAME} ${OBJECTIVE} 0`)
    await new Promise(r => setTimeout(r, 500))
  })

  after(async () => {
    if (questId && token) {
      await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    }
    await rcon(`scoreboard objectives remove ${OBJECTIVE}`).catch(() => {})
    if (bot) await quitBot(bot)
  })

  it('PR-1: 未受取のまま2回クリアすると pendingRewards が 2 になる', async () => {
    // 1回目クリア（score = 5）
    const c1 = await clearOnce(bot, REQUIRED_SCORE)
    console.log('1回目完了チャット:', c1 ? JSON.stringify(c1) : '(届かず)')

    // unlimited は完了直後に自動リセットされる
    await new Promise(r => setTimeout(r, 1500))

    // 2回目クリア（前回クリア時 5 + 差分 5 = 10）
    const c2 = await clearOnce(bot, REQUIRED_SCORE * 2)
    console.log('2回目完了チャット:', c2 ? JSON.stringify(c2) : '(届かず)')

    await new Promise(r => setTimeout(r, 1500))

    const { status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
    console.log('2回クリア後の進捗API:', status, JSON.stringify(body))
    assert.equal(status, 200, `進捗取得失敗: ${JSON.stringify(body)}`)

    assert.equal(
      body.pendingRewards, 2,
      `未受取報酬が2回分積み上がっていない（pendingRewards=${body.pendingRewards}）: ${JSON.stringify(body)}`,
    )
  })

  it('PR-2: 未受取報酬がある間は rewardClaimable=true（Web に ★報酬ボタンが出る条件）', async () => {
    const { status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
    assert.equal(status, 200, `進捗取得失敗: ${JSON.stringify(body)}`)
    console.log('rewardClaimable 判定:', JSON.stringify(body))

    assert.ok(
      body.rewardClaimable === true,
      `pendingRewards=${body.pendingRewards} なのに rewardClaimable が false。`
      + `unlimited は完了直後に completed=0 へリセットされるため、`
      + `rewardClaimable=completed&&!rewardClaimed では報酬ボタン(×N)が出ない: ${JSON.stringify(body)}`,
    )
  })
})
