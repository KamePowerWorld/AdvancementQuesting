/**
 * view-as (他プレイヤー覗き見) 機能 E2E テスト (MC-VA)
 *
 *  MC-VA-1: ボットがクエストをクリアすると /api/players/{uuid}/progress に完了が返る
 *  MC-VA-3: クリアが /api/players/{uuid}/activity に出る
 *  MC-VA-4: claim すると /api/players/{uuid}/rewards の totalsByType に amount が出る
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const TEST_ADV_MC = 'minecraft:story/mine_stone'

interface ProgressRow { questId: number; completed: boolean }
interface ActivityResp { items: Array<{ questId: number; questTitle: string }>; nextCursor: number | null }
interface RewardsResp { totalsByType: Record<string, number>; items: Array<{ questId: number; rewardType: string; amount: number }> }

async function setupBot(name: string): Promise<{ bot: Bot; token: string; uuid: string }> {
  const bot = await createBot(name)
  await new Promise(r => setTimeout(r, 1500))
  await rcon(`op ${name}`).catch(() => {})
  await rcon(`gamemode survival ${name}`).catch(() => {})
  await new Promise(r => setTimeout(r, 500))
  const chatPromise = waitForChat(bot, t => /\d{6}/.test(t), 8000)
  bot.chat('/quest code')
  const msg = await chatPromise
  const code = msg.match(/(\d{6})/)![1]
  const { body } = await apiRequest<{ token: string; playerUuid: string }>('POST', '/api/auth/code', { body: { code } })
  return { bot, token: body.token, uuid: body.playerUuid }
}

async function clearViaAdvancement(name: string) {
  await rcon(`advancement revoke ${name} only ${TEST_ADV_MC}`).catch(() => {})
  await new Promise(r => setTimeout(r, 400))
  await rcon(`advancement grant ${name} only ${TEST_ADV_MC}`)
  await new Promise(r => setTimeout(r, 1500))
}

describe('view-as (MC-VA)', () => {
  let bot: Bot
  let token: string
  let uuid: string
  let questId: number

  before(async () => {
    const s = await setupBot('ViewBot' + Math.floor(Math.random() * 100000))
    bot = s.bot
    token = s.token
    uuid = s.uuid

    const { status, body } = await apiRequest<{ id: number }>('POST', '/api/quests', {
      token,
      body: {
        title: `view-asテスト_${Date.now()}`,
        status: 'public',
        icon: 'stone',
        prerequisites: [],
        conditions: [{ id: 'cond-adv', type: 'advancement', advancementId: TEST_ADV_MC, requiredCount: 1 }],
        rewards: [
          { id: 'r-point', type: 'point', label: '達成ポイント', amount: 50 },
          { id: 'r-exp', type: 'experience', label: '経験値', amount: 100 },
        ],
        mapPosition: { x: 780, y: 780 },
        category: null,
        customButtons: [],
      },
    })
    assert.ok(status === 200 || status === 201, `クエスト作成失敗: ${JSON.stringify(body)}`)
    questId = body.id
  })

  after(async () => {
    if (questId && token) await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    if (bot) await quitBot(bot)
  })

  it('MC-VA-1: クリアすると /api/players/{uuid}/progress に完了が返る', async () => {
    await clearViaAdvancement(bot.username)

    const { status, body } = await apiRequest<ProgressRow[]>('GET', `/api/players/${uuid}/progress`)
    assert.equal(status, 200, `progress 取得失敗: ${JSON.stringify(body)}`)
    const mine = body.find(p => p.questId === questId)
    assert.ok(mine != null, `自分の進捗がない: ${JSON.stringify(body)}`)
    assert.ok(mine!.completed, 'completed が true でない')
  })

  it('MC-VA-3: クリアが /api/players/{uuid}/activity に出る', async () => {
    const { status, body } = await apiRequest<ActivityResp>('GET', `/api/players/${uuid}/activity`)
    assert.equal(status, 200, `activity 取得失敗: ${JSON.stringify(body)}`)
    const mine = body.items.find(i => i.questId === questId)
    assert.ok(mine != null, `アクティビティに出ていない: ${JSON.stringify(body.items)}`)
  })

  it('MC-VA-4: claim すると /api/players/{uuid}/rewards に amount が出る', async () => {
    // /quest claim で報酬受取 → reward_claims に追記される
    bot.chat(`/quest claim ${questId}`)
    await new Promise(r => setTimeout(r, 1500))

    const { status, body } = await apiRequest<RewardsResp>('GET', `/api/players/${uuid}/rewards`)
    assert.equal(status, 200, `rewards 取得失敗: ${JSON.stringify(body)}`)
    // point=50, experience=100 が記録される
    assert.ok((body.totalsByType['point'] ?? 0) >= 50, `point 合計が不足: ${JSON.stringify(body.totalsByType)}`)
    assert.ok((body.totalsByType['experience'] ?? 0) >= 100, `exp 合計が不足: ${JSON.stringify(body.totalsByType)}`)
    // 明細から取得元クエストを辿れる
    assert.ok(body.items.some(i => i.questId === questId), '明細に取得元クエストがない')
  })
})
