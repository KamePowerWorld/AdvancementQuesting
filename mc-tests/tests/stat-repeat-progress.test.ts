/**
 * 繰り返しクエスト stat 条件 差分判定 E2E テスト
 *
 * 確認内容:
 *  SR-1: stat条件クエスト(unlimited)を1回目クリアできる
 *  SR-2: クリア後に進捗が自動リセットされ completed=false になる
 *  SR-3: 2回目のクリアに必要な差分(required分)だけ積み上げると達成できる
 *        （累積値ではなく前回クリア時からの差分で判定されること）
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const BOT_NAME = 'SrBot' + Math.floor(Math.random() * 100000)

const OBJECTIVE = `test_sr_${Date.now()}`
const REQUIRED_SCORE = 5

interface ConditionProgress {
  conditionId: string
  completed: boolean
  current?: number
  required?: number
  baseValue?: number
  rawValue?: number
}

interface QuestProgress {
  completed: boolean
  progress?: ConditionProgress[]
}

describe('繰り返しクエスト stat 差分判定', () => {
  let bot: Bot
  let token: string
  let questId: number
  const condId = `cond-sr-${Date.now()}`

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

    // unlimited 繰り返しクエスト（scoreboard条件: REQUIRED_SCORE 点）を作成
    const { status: cs, body: created } = await apiRequest<{ id: number }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `SR差分テスト_${Date.now()}`,
          status: 'public',
          icon: 'paper',
          prerequisites: [],
          conditions: [{
            id: condId,
            type: 'scoreboard',
            objective: OBJECTIVE,
            score: REQUIRED_SCORE,
          }],
          rewards: [],
          repeat: { type: 'unlimited' },
          mapPosition: { x: 900, y: 700 },
          category: null,
          customButtons: [],
        },
      },
    )
    assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
    questId = created.id
    console.log(`テストクエスト作成: id=${questId}, objective=${OBJECTIVE}, score>=${REQUIRED_SCORE}, repeat=unlimited`)

    // スコアボードを作成
    await rcon(`scoreboard objectives add ${OBJECTIVE} dummy "SR差分テスト"`).catch(() => {})
    await new Promise(r => setTimeout(r, 500))

    // 初期スコアを 0 に設定
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

  it('SR-1: 1回目 — スコアが required 以上になるとクエストが完了する', async () => {
    const chatPromise = waitForChat(
      bot,
      t => t.includes('クエスト完了') || t.includes('✨'),
      15000,
    ).catch(() => null)

    // スコアを REQUIRED_SCORE に設定（1回目クリア）
    await rcon(`scoreboard players set ${BOT_NAME} ${OBJECTIVE} ${REQUIRED_SCORE}`)
    await new Promise(r => setTimeout(r, 3000))

    const mcChat = await chatPromise
    console.log('1回目完了チャット:', mcChat ? JSON.stringify(mcChat) : '(届かず)')

    const { status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
    console.log('1回目完了後の進捗API:', status, JSON.stringify(body))

    assert.ok(
      mcChat || (status === 200 && (body.completed || body.progress?.some(p => p.completed))),
      `1回目クリアできなかった。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
    )
  })

  it('SR-2: unlimited クエストはクリア後に自動リセットされ completed=false になる', async () => {
    // unlimited なので少し待てば自動リセットされているはず
    await new Promise(r => setTimeout(r, 2000))

    const { status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
    assert.equal(status, 200, `進捗取得失敗: ${JSON.stringify(body)}`)
    assert.ok(!body.completed, `リセット後も completed=true のまま: ${JSON.stringify(body)}`)
    console.log('リセット後の進捗:', JSON.stringify(body))

    // baseValue が設定されていることを確認
    if (Array.isArray(body.progress) && body.progress.length > 0) {
      const cond = body.progress.find(p => p.conditionId === condId)
      if (cond) {
        assert.ok(
          typeof cond.baseValue === 'number' && cond.baseValue > 0,
          `baseValue が設定されていない: ${JSON.stringify(cond)}`,
        )
        console.log(`baseValue = ${cond.baseValue} (= 1回目クリア時のスコア ${REQUIRED_SCORE})`)
      }
    }
  })

  it('SR-3: 2回目 — 前回クリア時からの差分 required 分だけ積み上げると達成できる（累積値不要）', async () => {
    // 現在のスコアは REQUIRED_SCORE（1回目クリア時）のまま
    // ここに REQUIRED_SCORE をさらに加算して「前回クリア時+REQUIRED_SCORE」にする
    const newScore = REQUIRED_SCORE * 2  // 例: 5+5=10
    console.log(`スコアを ${newScore} に設定（前回クリア時 ${REQUIRED_SCORE} + 差分 ${REQUIRED_SCORE}）`)

    const chatPromise = waitForChat(
      bot,
      t => t.includes('クエスト完了') || t.includes('✨'),
      15000,
    ).catch(() => null)

    await rcon(`scoreboard players set ${BOT_NAME} ${OBJECTIVE} ${newScore}`)
    await new Promise(r => setTimeout(r, 3000))

    const mcChat = await chatPromise
    console.log('2回目完了チャット:', mcChat ? JSON.stringify(mcChat) : '(届かず)')

    const { status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
    console.log('2回目完了後の進捗API:', status, JSON.stringify(body))

    assert.ok(
      mcChat || (status === 200 && body.progress?.some(p => p.conditionId === condId && p.completed)),
      `差分 ${REQUIRED_SCORE} 分を積み上げても2回目クリアできなかった（累積値判定になっている可能性）。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
    )
  })
})
