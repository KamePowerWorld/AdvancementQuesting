/**
 * バグ修正検証: カスタム統計条件 E2E テスト
 *
 * 対象統計:
 *  1. minecraft:drop (アイテムを捨てた回数)
 *  2. minecraft:walk_one_cm (歩いた距離)
 *  3. minecraft:open_chest (チェストを開いた回数)
 *  4. minecraft:interact_with_furnace (かまどを使用した回数)
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const DROP_BOT_NAME = 'DropBot' + Math.floor(Math.random() * 100000)
const WALK_BOT_NAME = 'WalkBot' + Math.floor(Math.random() * 100000)
const CHEST_BOT_NAME = 'ChestBot' + Math.floor(Math.random() * 100000)
const FURNACE_BOT_NAME = 'FurnaceBot' + Math.floor(Math.random() * 100000)
const DROP_COUNT = 3
const WALK_CM = 100
const OPEN_CHEST_COUNT = 3
const FURNACE_COUNT = 3

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

  describe('minecraft:walk_one_cm (歩いた距離)', () => {
    let bot: Bot
    let token: string
    let questId: number
    const condId = `cond-walk-${Date.now()}`

    before(async () => {
      bot = await createBot(WALK_BOT_NAME)
      await new Promise(r => setTimeout(r, 1500))

      await rcon(`op ${WALK_BOT_NAME}`).catch(() => {})
      await rcon(`gamemode survival ${WALK_BOT_NAME}`).catch(() => {})
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
            title: `Walkテスト_${Date.now()}`,
            status: 'public',
            icon: 'leather_boots',
            prerequisites: [],
            conditions: [{
              id: condId,
              type: 'stat',
              statType: 'minecraft:custom',
              statId: 'minecraft:walk_one_cm',
              count: WALK_CM,
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
      console.log(`Walkテストクエスト作成: id=${questId}, stat=custom/walk_one_cm ×${WALK_CM}cm`)
    })

    after(async () => {
      if (questId && token) {
        await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
      }
      if (bot) await quitBot(bot)
    })

    it('walk_one_cm 条件クエストが完了する', async () => {
      const chatPromise = waitForChat(
        bot,
        (t) => t.includes('クエスト完了') || t.includes('✨'),
        30000,
      ).catch(() => null)

      // 足場を整地する: 移動はブロックに引っかかると 0cm のまま進捗しない
      const p = bot.entity.position.floored()
      await rcon(`fill ${p.x - 5} ${p.y - 1} ${p.z - 5} ${p.x + 5} ${p.y - 1} ${p.z + 5} minecraft:stone`).catch(() => {})
      await rcon(`fill ${p.x - 5} ${p.y} ${p.z - 5} ${p.x + 5} ${p.y + 2} ${p.z + 5} minecraft:air`).catch(() => {})
      await new Promise(r => setTimeout(r, 800))

      const startPos = bot.entity.position.clone()
      bot.setControlState('forward', true)
      await new Promise(r => setTimeout(r, 4000))
      bot.setControlState('forward', false)
      console.log(`歩行距離: ${bot.entity.position.distanceTo(startPos).toFixed(2)}m`)
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
        `歩いて${WALK_CM}cm移動してもクエストが完了しない。walk_one_cm 統計イベントの可能性。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
      )
    })
  })

  describe('minecraft:open_chest (チェストを開いた回数)', () => {
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
              statId: 'minecraft:open_chest',
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
      console.log(`OpenChestテストクエスト作成: id=${questId}, stat=custom/open_chest ×${OPEN_CHEST_COUNT}`)
    })

    after(async () => {
      if (questId && token) {
        await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
      }
      if (bot) await quitBot(bot)
    })

    it('open_chest 条件クエストが完了する', async () => {
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
        `チェスト${OPEN_CHEST_COUNT}回開けてもクエストが完了しない。open_chest 統計イベントの可能性。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
      )
    })
  })

  describe('minecraft:interact_with_furnace (かまどを使用した回数)', () => {
    let bot: Bot
    let token: string
    let questId: number
    const condId = `cond-furnace-${Date.now()}`

    before(async () => {
      bot = await createBot(FURNACE_BOT_NAME)
      await new Promise(r => setTimeout(r, 1500))

      await rcon(`op ${FURNACE_BOT_NAME}`).catch(() => {})
      await rcon(`gamemode survival ${FURNACE_BOT_NAME}`).catch(() => {})
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
            title: `Furnaceテスト_${Date.now()}`,
            status: 'public',
            icon: 'furnace',
            prerequisites: [],
            conditions: [{
              id: condId,
              type: 'stat',
              statType: 'minecraft:custom',
              statId: 'minecraft:interact_with_furnace',
              count: FURNACE_COUNT,
            }],
            rewards: [],
            mapPosition: { x: 250, y: 250 },
            category: null,
            customButtons: [],
          },
        },
      )
      assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
      questId = created.id
      console.log(`Furnaceテストクエスト作成: id=${questId}, stat=custom/interact_with_furnace ×${FURNACE_COUNT}`)
    })

    after(async () => {
      if (questId && token) {
        await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
      }
      if (bot) await quitBot(bot)
    })

    it('interact_with_furnace 条件クエストが完了する', async () => {
      const chatPromise = waitForChat(
        bot,
        (t) => t.includes('クエスト完了') || t.includes('✨'),
        30000,
      ).catch(() => null)

      const pos = bot.entity.position.floored()
      const furnacePos = pos.offset(2, 0, 0)
      await rcon(`setblock ${furnacePos.x} ${furnacePos.y} ${furnacePos.z} minecraft:furnace`).catch(() => {})
      await new Promise(r => setTimeout(r, 800))

      const furnaceBlock = bot.blockAt(furnacePos)
      if (!furnaceBlock || furnaceBlock.name !== 'furnace') {
        throw new Error(`かまどが設置されていない: ${furnaceBlock?.name}`)
      }

      for (let i = 0; i < FURNACE_COUNT; i++) {
        try {
          const furnace = await bot.openFurnace(furnaceBlock)
          await new Promise(r => setTimeout(r, 300))
          furnace.close()
          await new Promise(r => setTimeout(r, 500))
        } catch (e) {
          console.warn(`かまど操作失敗 (i=${i}):`, e)
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
        `かまど${FURNACE_COUNT}回開けてもクエストが完了しない。interact_with_furnace 統計イベントの可能性。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
      )
    })
  })
})
