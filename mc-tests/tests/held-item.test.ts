/**
 * 手持ちアイテム取得 API E2E テスト
 *
 * 確認内容:
 *  HI-1: /api/player/held-item が返す itemId が完全形式 ("minecraft:diamond_sword")
 *        (API境界のIDは常に NamespacedId の完全形式。フロント側が NamespacedId.parse で受ける)
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 *  - MC_HOST / MC_PORT / API_BASE 環境変数で接続先を変更できる
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const BOT_NAME = 'HeldBot' + Math.floor(Math.random() * 100000)

interface HeldItemResponse {
  itemId: string
  count: number
  displayName?: string
}

describe('手持ちアイテム取得API', () => {
  let bot: Bot
  let token: string

  before(async () => {
    bot = await createBot(BOT_NAME)
    await new Promise(r => setTimeout(r, 1500))

    await rcon(`op ${BOT_NAME}`).catch(() => {})
    await rcon(`gamemode creative ${BOT_NAME}`).catch(() => {})
    await new Promise(r => setTimeout(r, 500))

    const chatPromise = waitForChat(bot, t => /\d{6}/.test(t), 8000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)![1]
    const { status, body } = await apiRequest<{ token: string; playerUuid: string }>(
      'POST', '/api/auth/code', { body: { code } },
    )
    assert.equal(status, 200, `認証失敗: ${JSON.stringify(body)}`)
    token = body.token
  })

  after(async () => {
    await quitBot(bot)
  })

  it('HI-1: itemId が完全形式 (namespace:path) で返る', async () => {
    await rcon(`item replace entity ${BOT_NAME} weapon.mainhand with diamond_sword`)
    await new Promise(r => setTimeout(r, 500))

    const { status, body } = await apiRequest<HeldItemResponse>(
      'GET', '/api/player/held-item', { token },
    )
    assert.equal(status, 200, `取得失敗: ${JSON.stringify(body)}`)
    assert.equal(body.itemId, 'minecraft:diamond_sword', `itemId が完全形式でない: ${body.itemId}`)
  })
})
