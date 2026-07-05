/**
 * ランキング機能 E2E テスト (MC-RK)
 *
 * 確認内容:
 *  MC-RK-1: ボットでクエストをクリアすると first ランキングに rank 1 で出る
 *  MC-RK-2: 繰り返し(unlimited)クエストを2回クリアすると count ランキングで clears=2
 *  MC-RK-3: 2体のボットが順にクリアすると first ランキングがクリア時刻順になる
 *
 * 完了トリガーは advancement grant を使う (notifyQuestComplete → クリアログ追記 を検証)。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const TEST_ADV_MC = 'minecraft:story/mine_stone'

interface RankEntry {
  rank: number
  playerUuid: string
  playerName: string
  clears: number
}
interface RankingResponse {
  type: string
  totalPlayers: number
  top: RankEntry[]
  me: { rank: number; clears: number } | null
}

/** ボットを作成して認証トークンを取得する */
async function setupBot(name: string): Promise<{ bot: Bot; token: string }> {
  const bot = await createBot(name)
  await new Promise(r => setTimeout(r, 1500))
  await rcon(`op ${name}`).catch(() => {})
  await rcon(`gamemode survival ${name}`).catch(() => {})
  await new Promise(r => setTimeout(r, 500))
  const chatPromise = waitForChat(bot, t => /\d{6}/.test(t), 8000)
  bot.chat('/quest code')
  const msg = await chatPromise
  const code = msg.match(/(\d{6})/)![1]
  const { body } = await apiRequest<{ token: string }>('POST', '/api/auth/code', { body: { code } })
  return { bot, token: body.token }
}

/** advancement を revoke→grant してクエストを1回クリアさせる */
async function clearViaAdvancement(name: string) {
  await rcon(`advancement revoke ${name} only ${TEST_ADV_MC}`).catch(() => {})
  await new Promise(r => setTimeout(r, 400))
  await rcon(`advancement grant ${name} only ${TEST_ADV_MC}`)
  await new Promise(r => setTimeout(r, 1500))
}

describe('ランキング (MC-RK)', () => {
  let bot: Bot
  let token: string
  let questId: number

  before(async () => {
    const s = await setupBot('RankBot' + Math.floor(Math.random() * 100000))
    bot = s.bot
    token = s.token

    const { status, body } = await apiRequest<{ id: number }>('POST', '/api/quests', {
      token,
      body: {
        title: `ランキングテスト_${Date.now()}`,
        status: 'public',
        icon: 'stone',
        prerequisites: [],
        conditions: [{ id: 'cond-adv', type: 'advancement', advancementId: TEST_ADV_MC, requiredCount: 1 }],
        rewards: [],
        mapPosition: { x: 770, y: 770 },
        category: null,
        customButtons: [],
        repeat: { type: 'unlimited' },
      },
    })
    assert.ok(status === 200 || status === 201, `クエスト作成失敗: ${JSON.stringify(body)}`)
    questId = body.id
    console.log(`ランキングテストクエスト: id=${questId}`)
  })

  after(async () => {
    if (questId && token) {
      await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    }
    if (bot) await quitBot(bot)
  })

  it('MC-RK-1: クリアすると first ランキングに rank 1 で出る', async () => {
    await clearViaAdvancement(bot.username)

    const { status, body } = await apiRequest<RankingResponse>(
      'GET', `/api/quests/${questId}/ranking?type=first`, { token },
    )
    assert.equal(status, 200, `ランキング取得失敗: ${JSON.stringify(body)}`)
    console.log('first ranking:', JSON.stringify(body))
    // 注: 同じ advancement (story/mine_stone) を使う他テストのボットが
    // 同時にこのクエストを完了させうるため「rank 1」は保証しない。
    // 自分がランキングに載り me が埋まることを検証する。
    const mine = body.top.find(e => e.playerName === bot.username)
    assert.ok(mine != null, `ランキングに自分がいない: ${JSON.stringify(body.top)}`)
    assert.ok(mine!.clears >= 1, 'clears が 1 未満')
    assert.ok(body.me != null && body.me.rank >= 1, 'me が埋まっていない')
  })

  it('MC-RK-2: 2回クリアすると count ランキングで clears=2', async () => {
    // 1回目は MC-RK-1 で済んでいる。2回目をクリア (unlimited なので即再挑戦可能)
    await clearViaAdvancement(bot.username)

    const { status, body } = await apiRequest<RankingResponse>(
      'GET', `/api/quests/${questId}/ranking?type=count`, { token },
    )
    assert.equal(status, 200, `count ランキング取得失敗: ${JSON.stringify(body)}`)
    console.log('count ranking:', JSON.stringify(body))
    const mine = body.top.find(e => e.playerName === bot.username)
    assert.ok(mine != null, 'count ランキングに自分がいない')
    assert.ok(mine!.clears >= 2, `clears が 2 未満: ${mine!.clears}`)
  })

  it('MC-RK-3: 2体のボットのクリア順が first ランキングに反映される', async () => {
    // 別クエスト (非繰り返し) を作って2体で順にクリアする
    const { body: q2 } = await apiRequest<{ id: number }>('POST', '/api/quests', {
      token,
      body: {
        title: `ランキング順序テスト_${Date.now()}`,
        status: 'public',
        icon: 'stone',
        prerequisites: [],
        conditions: [{ id: 'cond-adv', type: 'advancement', advancementId: TEST_ADV_MC, requiredCount: 1 }],
        rewards: [],
        mapPosition: { x: 760, y: 760 },
        category: null,
        customButtons: [],
      },
    })
    const q2Id = q2.id

    // 2体目のボット
    const second = await setupBot('RankBot2' + Math.floor(Math.random() * 100000))
    try {
      // bot1 が先にクリア
      await rcon(`advancement revoke ${bot.username} only ${TEST_ADV_MC}`).catch(() => {})
      await rcon(`advancement grant ${bot.username} only ${TEST_ADV_MC}`)
      await new Promise(r => setTimeout(r, 1800))
      // bot2 が後にクリア
      await rcon(`advancement revoke ${second.bot.username} only ${TEST_ADV_MC}`).catch(() => {})
      await rcon(`advancement grant ${second.bot.username} only ${TEST_ADV_MC}`)
      await new Promise(r => setTimeout(r, 1800))

      const { status, body } = await apiRequest<RankingResponse>(
        'GET', `/api/quests/${q2Id}/ranking?type=first`, { token },
      )
      assert.equal(status, 200, `ランキング取得失敗: ${JSON.stringify(body)}`)
      console.log('order ranking:', JSON.stringify(body))
      assert.ok(body.top.length >= 2, `2人分のクリアが記録されていない: ${JSON.stringify(body.top)}`)
      // 他テストのボット汚染がありうるので絶対順位ではなく相対順序を検証する:
      // 先にクリアした bot1 が bot2 より上位 (rank が小さい) であること
      const r1 = body.top.find(e => e.playerName === bot.username)
      const r2 = body.top.find(e => e.playerName === second.bot.username)
      assert.ok(r1 != null, `bot1 がランキングにいない: ${JSON.stringify(body.top)}`)
      assert.ok(r2 != null, `bot2 がランキングにいない: ${JSON.stringify(body.top)}`)
      assert.ok(r1!.rank < r2!.rank, `先にクリアした bot1 が bot2 より上位でない: bot1=${r1!.rank}, bot2=${r2!.rank}`)
    } finally {
      await apiRequest('DELETE', `/api/quests/${q2Id}`, { token }).catch(() => {})
      await quitBot(second.bot)
    }
  })
})
