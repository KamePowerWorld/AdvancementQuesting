/**
 * バグ修正検証: カスタム統計条件 E2E テスト
 *
 * 対象統計:
 *  1. minecraft:drop (アイテムを捨てた回数)
 *  2. minecraft:crouch_one_cm (スニークした距離)
 *  3. minecraft:chest_opened (チェストを開いた回数)
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const DROP_BOT_NAME = 'DropBot' + Math.floor(Math.random() * 100000)
const CROUCH_BOT_NAME = 'CrouchBot' + Math.floor(Math.random() * 100000)
const CHEST_BOT_NAME = 'ChestBot' + Math.floor(Math.random() * 100000)
const DROP_COUNT = 3
const CROUCH_CM = 100
const OPEN_CHEST_COUNT = 3

interface QuestProgress {
  completed: boolean
  progress?: Array<{ conditionId: string; completed: boolean; current?: number; required?: number }>
}

describe('カスタム統計バグ修正検証 (MC-SC-Fix)', () => {
  describe('minecraft:drop (アイテムを捨てた回数)', () => {
    let bot: Bot
    let token: string
    let questId: number
    const condId = `cond-drop-${Date.now()}`

    before(async () => {
      bot = await createBot(DROP_BOT_NAME)
      await new Promise(r => setTimeout(r, 1500))

      await rcon(`op ${DROP_BOT_NAME}`).catch(() => {})
      await rcon(`gamemode survival ${DROP_BOT_NAME}`).catch(() => {})
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
            title: `Dropテスト_${Date.now()}`,
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
            mapPosition: { x: 100, y: 100 },
            category: null,
            customButtons: [],
          },
        },
      )
      assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
      questId = created.id
      console.log(`Dropテストクエスト作成: id=${questId}, stat=custom/drop ×${DROP_COUNT}`)
    })

    after(async () => {
      if (questId && token) {
        await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
      }
      if (bot) await quitBot(bot)
    })

    it('drop 条件クエストが完了する', async () => {
      const chatPromise = waitForChat(
        bot,
        (t) => t.includes('クエスト完了') || t.includes('✨'),
        30000,
      ).catch(() => null)

      await rcon(`/give ${DROP_BOT_NAME} minecraft:dirt ${DROP_COUNT + 5}`)
      await new Promise(r => setTimeout(r, 800))

      for (let i = 0; i < DROP_COUNT; i++) {
        const items = bot.inventory.items()
        const dirt = items.find(item => item.name === 'dirt')
        if (!dirt) {
          console.warn(` dirt が見つかりません (i=${i})`)
          break
        }
        await bot.toss(dirt.type, dirt.metadata, 1)
        await new Promise(r => setTimeout(r, 500))
      }

      const mcChat = await chatPromise
      console.log('完了チャット:', mcChat ? JSON.stringify(mcChat) : '(届かず)')

      let status = 0
      let body: QuestProgress | undefined
      if (!mcChat) {
        for (let i = 0; i < 10; i++) {
          ;({ status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token }))
          if (status === 200 && body?.completed) break
          await new Promise(r => setTimeout(r, 500))
        }
      } else {
        ;({ status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token }))
      }
      console.log('進捗API:', status, JSON.stringify(body))

      assert.ok(
        mcChat || (status === 200 && body?.completed),
        `アイテム${DROP_COUNT}回捨ててもクエストが完了しない。drop 統計イベントの可能性。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
      )
    })
  })

  describe('minecraft:crouch_one_cm (スニークした距離)', () => {
    let bot: Bot
    let token: string
    let questId: number
    const condId = `cond-crouch-${Date.now()}`

    before(async () => {
      bot = await createBot(CROUCH_BOT_NAME)
      await new Promise(r => setTimeout(r, 1500))

      await rcon(`op ${CROUCH_BOT_NAME}`).catch(() => {})
      await rcon(`gamemode survival ${CROUCH_BOT_NAME}`).catch(() => {})
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
            title: `Crouchテスト_${Date.now()}`,
            status: 'public',
            icon: 'leather_boots',
            prerequisites: [],
            conditions: [{
              id: condId,
              type: 'stat',
              statType: 'minecraft:custom',
              statId: 'minecraft:crouch_one_cm',
              count: CROUCH_CM,
            }],
            rewards: [],
            mapPosition: { x: 150, y: 150 },
            category: null,
            customButtons: [],
          },
        },
      )
      assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
      questId = created.id
      console.log(`Crouchテストクエスト作成: id=${questId}, stat=custom/crouch_one_cm ×${CROUCH_CM}cm`)
    })

    after(async () => {
      if (questId && token) {
        await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
      }
      if (bot) await quitBot(bot)
    })

    it('crouch_one_cm 条件クエストが完了する', async () => {
      const chatPromise = waitForChat(
        bot,
        (t) => t.includes('クエスト完了') || t.includes('✨'),
        30000,
      ).catch(() => null)

      bot.setControlState('sneak', true)
      bot.setControlState('forward', true)
      await new Promise(r => setTimeout(r, 2000))
      bot.setControlState('forward', false)
      bot.setControlState('sneak', false)
      await new Promise(r => setTimeout(r, 800))

      const mcChat = await chatPromise
      console.log('完了チャット:', mcChat ? JSON.stringify(mcChat) : '(届かず)')

      let status = 0
      let body: QuestProgress | undefined
      if (!mcChat) {
        for (let i = 0; i < 10; i++) {
          ;({ status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token }))
          if (status === 200 && body?.completed) break
          await new Promise(r => setTimeout(r, 500))
        }
      } else {
        ;({ status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token }))
      }
      console.log('進捗API:', status, JSON.stringify(body))

      assert.ok(
        mcChat || (status === 200 && body?.completed),
        `スニーク${CROUCH_CM}cm移動してもクエストが完了しない。crouch_one_cm 統計イベントの可能性。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
      )
    })
  })

  describe('minecraft:chest_opened (チェストを開いた回数)', () => {
    let bot: Bot
    let token: string
    let questId: number
    const condId = `cond-chest-${Date.now()}`

    before(async () => {
      bot = await createBot(CHEST_BOT_NAME)
      await new Promise(r => setTimeout(r, 1500))

      await rcon(`op ${CHEST_BOT_NAME}`).catch(() => {})
      await rcon(`gamemode survival ${CHEST_BOT_NAME}`).catch(() => {})
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
            title: `OpenChestテスト_${Date.now()}`,
            status: 'public',
            icon: 'chest',
            prerequisites: [],
            conditions: [{
              id: condId,
              type: 'stat',
              statType: 'minecraft:custom',
              statId: 'minecraft:chest_opened',
              count: OPEN_CHEST_COUNT,
            }],
            rewards: [],
            mapPosition: { x: 200, y: 200 },
            category: null,
            customButtons: [],
          },
        },
      )
      assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
      questId = created.id
      console.log(`OpenChestテストクエスト作成: id=${questId}, stat=custom/chest_opened ×${OPEN_CHEST_COUNT}`)
    })

    after(async () => {
      if (questId && token) {
        await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
      }
      if (bot) await quitBot(bot)
    })

    it('chest_opened 条件クエストが完了する', async () => {
      const chatPromise = waitForChat(
        bot,
        (t) => t.includes('クエスト完了') || t.includes('✨'),
        30000,
      ).catch(() => null)

      const pos = bot.entity.position.floored()
      const chestPos = pos.offset(2, 0, 0)
      await rcon(`setblock ${chestPos.x} ${chestPos.y} ${chestPos.z} minecraft:chest`).catch(() => {})
      await new Promise(r => setTimeout(r, 800))

      const chestBlock = bot.blockAt(chestPos)
      if (!chestBlock || chestBlock.name !== 'chest') {
        throw new Error(`チェストが設置されていない: ${chestBlock?.name}`)
      }

      for (let i = 0; i < OPEN_CHEST_COUNT; i++) {
        try {
          const chest = await bot.openChest(chestBlock)
          await new Promise(r => setTimeout(r, 300))
          chest.close()
          await new Promise(r => setTimeout(r, 500))
        } catch (e) {
          console.warn(`チェスト操作失敗 (i=${i}):`, e)
        }
      }

      const mcChat = await chatPromise
      console.log('完了チャット:', mcChat ? JSON.stringify(mcChat) : '(届かず)')

      let status = 0
      let body: QuestProgress | undefined
      if (!mcChat) {
        for (let i = 0; i < 10; i++) {
          ;({ status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token }))
          if (status === 200 && body?.completed) break
          await new Promise(r => setTimeout(r, 500))
        }
      } else {
        ;({ status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token }))
      }
      console.log('進捗API:', status, JSON.stringify(body))

      assert.ok(
        mcChat || (status === 200 && body?.completed),
        `チェスト${OPEN_CHEST_COUNT}回開けてもクエストが完了しない。chest_opened 統計イベントの可能性。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
      )
    })
  })
})
