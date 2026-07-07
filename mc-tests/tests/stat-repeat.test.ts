/**
 * 繰り返しクエスト × 統計条件 E2E テスト
 *
 * unlimited 繰り返し + minecraft:drop 条件のクエストで、
 * 1回目のクリア後に進捗がリセットされ(baseValue引き継ぎ + rebase)、
 * 追加でアイテムを捨てると2回目のクリアになることを検証する。
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const BOT_NAME = 'RepeatBot' + Math.floor(Math.random() * 100000)
const DROP_COUNT = 3

interface QuestProgress {
  completed: boolean
  completedCount?: number
  progress?: Array<{ conditionId: string; completed: boolean; current?: number; required?: number }>
}

describe('繰り返しクエスト×統計条件 (MC-SR)', () => {
  let bot: Bot
  let token: string
  let questId: number
  const condId = `cond-repeat-drop-${Date.now()}`

  /** completedCount が目標値に達するまで進捗APIをポーリングする */
  async function waitForCompletedCount(target: number, timeoutMs = 20000): Promise<QuestProgress | undefined> {
    const deadline = Date.now() + timeoutMs
    let body: QuestProgress | undefined
    while (Date.now() < deadline) {
      const res = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
      if (res.status === 200) {
        body = res.body
        if ((body.completedCount ?? 0) >= target) return body
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return body
  }

  /** dirt を count 回捨てる */
  async function dropDirt(count: number) {
    for (let i = 0; i < count; i++) {
      const dirt = bot.inventory.items().find(item => item.name === 'dirt')
      if (!dirt) throw new Error(`dirt がインベントリにない (i=${i})`)
      await bot.toss(dirt.type, dirt.metadata, 1)
      await new Promise(r => setTimeout(r, 500))
    }
  }

  before(async () => {
    bot = await createBot(BOT_NAME)
    await new Promise(r => setTimeout(r, 1500))

    await rcon(`op ${BOT_NAME}`).catch(() => {})
    await rcon(`gamemode survival ${BOT_NAME}`).catch(() => {})
    await new Promise(r => setTimeout(r, 500))

    const chatPromise = waitForChat(bot, (t) => /\d{6}/.test(t), 8000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)![1]
    const { status, body } = await apiRequest<{ token: string; playerUuid: string }>(
      'POST', '/api/auth/code', { body: { code } },
    )
    assert.equal(status, 200, `認証失敗: ${JSON.stringify(body)}`)
    token = body.token

    const { status: cs, body: created } = await apiRequest<{ id: number }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `Repeatドロップテスト_${Date.now()}`,
          status: 'public',
          icon: 'dirt',
          prerequisites: [],
          conditions: [{
            id: condId,
            type: 'stat',
            statType: 'minecraft:custom',
            statId: 'minecraft:drop',
            count: DROP_COUNT,
          }],
          rewards: [],
          repeat: { type: 'unlimited' },
          mapPosition: { x: 300, y: 300 },
          category: null,
          customButtons: [],
        },
      },
    )
    assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
    questId = created.id
    console.log(`Repeatテストクエスト作成: id=${questId}, stat=custom/drop ×${DROP_COUNT} (unlimited)`)
  })

  after(async () => {
    if (questId && token) {
      await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    }
    if (bot) await quitBot(bot)
  })

  it('unlimited 繰り返しクエストが2回クリアできる', async () => {
    await rcon(`/give ${BOT_NAME} minecraft:dirt ${DROP_COUNT * 2 + 5}`)
    await new Promise(r => setTimeout(r, 800))

    // 1回目のクリア
    await dropDirt(DROP_COUNT)
    const first = await waitForCompletedCount(1)
    console.log('1回目進捗:', JSON.stringify(first))
    assert.ok((first?.completedCount ?? 0) >= 1,
      `1回目がクリアされない: ${JSON.stringify(first)}`)

    // unlimited は即座にリセットされる (completed=false に戻り baseValue 引き継ぎ)
    // 2回目: 追加で3回捨てる
    await new Promise(r => setTimeout(r, 1000))
    await dropDirt(DROP_COUNT)
    const second = await waitForCompletedCount(2)
    console.log('2回目進捗:', JSON.stringify(second))
    assert.ok((second?.completedCount ?? 0) >= 2,
      `2回目がクリアされない (リセット後の進捗が更新されていない): ${JSON.stringify(second)}`)
  })
})
