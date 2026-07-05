/**
 * カスタム統計 (custom stat) 条件のゲーム内 E2E テスト
 *
 * 確認内容:
 *  SC-1: statType=minecraft:custom, statId=minecraft:jump (ジャンプ回数) の条件が正しく進行する
 *  SC-2: StatProgressListener が UNTYPED (custom) 統計の PlayerStatisticIncrementEvent を正しく処理する
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const BOT_NAME = 'ScBot' + Math.floor(Math.random() * 100000)
const JUMP_COUNT = 5

interface QuestProgress {
  completed: boolean
  progress?: Array<{ conditionId: string; completed: boolean; current?: number; required?: number }>
}

/** ボットを指定回数ジャンプさせる */
async function jumpMultipleTimes(bot: Bot, count: number) {
  for (let i = 0; i < count; i++) {
    bot.setControlState('jump', true)
    await new Promise((r) => setTimeout(r, 50))
    bot.setControlState('jump', false)
    // 着地まで待機（falling == false になるまで）
    await new Promise((r) => setTimeout(r, 600))
  }
}

describe('カスタム統計条件 (MC-SC)', () => {
  let bot: Bot
  let token: string
  let questId: number
  const condId = `cond-sc-${Date.now()}`

  before(async () => {
    bot = await createBot(BOT_NAME)
    await new Promise((r) => setTimeout(r, 1500))

    await rcon(`op ${BOT_NAME}`).catch(() => {})
    await rcon(`gamemode survival ${BOT_NAME}`).catch(() => {})
    await new Promise((r) => setTimeout(r, 500))

    // 認証
    const chatPromise = waitForChat(bot, (t) => /\d{6}/.test(t), 8000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)![1]
    const { status, body } = await apiRequest<{ token: string; playerUuid: string }>(
      'POST', '/api/auth/code', { body: { code } },
    )
    assert.equal(status, 200, `認証失敗: ${JSON.stringify(body)}`)
    token = body.token

    // カスタム統計条件 (ジャンプ5回) のクエストを作成
    const { status: cs, body: created } = await apiRequest<{ id: number }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `SCテスト_${Date.now()}`,
          status: 'public',
          icon: 'rabbit_foot',
          prerequisites: [],
          conditions: [{
            id: condId,
            type: 'stat',
            statType: 'minecraft:custom',
            statId: 'minecraft:jump',
            count: JUMP_COUNT,
          }],
          rewards: [],
          mapPosition: { x: 50, y: 50 },
          category: 'テスト',
          customButtons: [],
        },
      },
    )
    assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
    questId = created.id
    console.log(`SCテストクエスト作成: id=${questId}, stat=custom/jump ×${JUMP_COUNT}`)
  })

  after(async () => {
    if (questId && token) {
      await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    }
    if (bot) await quitBot(bot)
  })

  it('SC-1: ジャンプ規定回数で custom stat 条件クエストが完了する', async () => {
    const chatPromise = waitForChat(
      bot,
      (t) => t.includes('クエスト完了') || t.includes('✨'),
      30000,
    ).catch(() => null)

    // ジャンプ実行
    await jumpMultipleTimes(bot, JUMP_COUNT)

    const mcChat = await chatPromise
    console.log('完了チャット:', mcChat ? JSON.stringify(mcChat) : '(届かず)')

    const { status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
    console.log('進捗API:', status, JSON.stringify(body))

    assert.ok(
      mcChat || (status === 200 && body.completed),
      `ジャンプ${JUMP_COUNT}回でもクエストが完了しない。custom stat 条件の解釈または StatProgressListener.UNTYPED 処理の可能性。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
    )
  })
})
