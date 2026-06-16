/**
 * 座標条件達成 E2E テスト
 *
 * 確認内容:
 *  LOC-1: プレイヤーが指定座標の半径内に移動すると location 条件が完了する
 *  LOC-2: 完了後に /api/progress/{questId} で completed: true になる
 *  LOC-3: /api/player/location で現在座標が取得できる
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 *  - MC_HOST / MC_PORT / API_BASE 環境変数で接続先を変更できる
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const BOT_NAME = 'LocBot' + Math.floor(Math.random() * 100000)

// テスト用の目標座標 (ほぼ確実に安全な空中座標)
const TARGET_X = 0
const TARGET_Y = 64
const TARGET_Z = 0
const TARGET_DIM = 'overworld'
const RADIUS = 5

interface QuestProgress {
  completed: boolean
  progress?: Array<{ conditionId: string; completed: boolean }>
}

interface LocationResponse {
  x: number
  y: number
  z: number
  dimension: string
}

describe('座標条件達成', () => {
  let bot: Bot
  let token: string
  let questId: number

  before(async () => {
    bot = await createBot(BOT_NAME)
    await new Promise(r => setTimeout(r, 1500))

    await rcon(`op ${BOT_NAME}`).catch(() => {})
    await rcon(`gamemode creative ${BOT_NAME}`).catch(() => {}) // 移動しやすくするためクリエイティブ
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

    // location 条件クエストを作成 (半径 5 以内に入ると達成)
    const condId = `cond-loc-${Date.now()}`
    const { status: cs, body: created } = await apiRequest<{ id: number }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `座標テスト_${Date.now()}`,
          status: 'public',
          icon: 'compass',
          prerequisites: [],
          conditions: [{
            id: condId,
            type: 'location',
            x: TARGET_X,
            y: TARGET_Y,
            z: TARGET_Z,
            dimension: TARGET_DIM,
            radius: RADIUS,
          }],
          rewards: [],
          mapPosition: { x: 700, y: 700 },
          category: null,
          customButtons: [],
        },
      },
    )
    assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
    questId = created.id
    console.log(`テストクエスト作成: id=${questId}, 目標座標=(${TARGET_X}, ${TARGET_Y}, ${TARGET_Z}) 半径${RADIUS}`)
  })

  after(async () => {
    if (questId && token) {
      await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    }
    if (bot) await quitBot(bot)
  })

  it('LOC-1: プレイヤーを目標座標にテレポートすると location 条件が完了する', async () => {
    // クエスト完了チャットを待ち受ける
    const chatPromise = waitForChat(
      bot,
      t => t.includes('クエスト完了') || t.includes('✨'),
      15000,
    ).catch(() => null)

    // 目標座標にテレポート
    await rcon(`tp ${BOT_NAME} ${TARGET_X} ${TARGET_Y} ${TARGET_Z}`)
    // 少し動いて PlayerMoveEvent を確実に発火させる
    await new Promise(r => setTimeout(r, 500))
    bot.setControlState('forward', true)
    await new Promise(r => setTimeout(r, 300))
    bot.setControlState('forward', false)
    await new Promise(r => setTimeout(r, 2000))

    const mcChat = await chatPromise
    console.log('完了チャット:', mcChat ? JSON.stringify(mcChat) : '(届かず)')

    const { status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
    console.log('進捗API:', status, JSON.stringify(body))

    assert.ok(
      mcChat || (status === 200 && body.completed),
      `座標達成チャットが届かず、APIでも完了していない。PlayerMoveEvent が発火していない可能性。`,
    )
  })

  it('LOC-2: 完了後に API で completed: true が確認できる', async () => {
    const { status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
    assert.equal(status, 200, `進捗取得失敗: ${JSON.stringify(body)}`)
    assert.ok(body.completed, `クエストが完了状態でない: ${JSON.stringify(body)}`)

    if (Array.isArray(body.progress) && body.progress.length > 0) {
      const cond = body.progress[0]
      assert.ok(cond.completed, `条件 completed がtrueでない: ${JSON.stringify(cond)}`)
    }
    console.log('進捗:', JSON.stringify(body))
  })

  it('LOC-3: /api/player/location で現在座標が取得できる', async () => {
    const { status, body } = await apiRequest<LocationResponse>('GET', '/api/player/location', { token })
    assert.equal(status, 200, `座標取得失敗: ${JSON.stringify(body)}`)
    assert.ok(typeof body.x === 'number', `x が数値でない: ${JSON.stringify(body)}`)
    assert.ok(typeof body.y === 'number', `y が数値でない: ${JSON.stringify(body)}`)
    assert.ok(typeof body.z === 'number', `z が数値でない: ${JSON.stringify(body)}`)
    assert.ok(typeof body.dimension === 'string', `dimension が文字列でない: ${JSON.stringify(body)}`)
    console.log('現在座標:', JSON.stringify(body))
  })
})
