/**
 * 統計 (stat) 条件 + ポイント (point) 報酬 のゲーム内 E2E テスト
 *
 * フロントエンドの提案ラウンドトリップ修正 (proposalToNode が point / stat を保持)
 * で歪むことなく保存される 2 つのデータ形状 — stat 条件 (statType/statId/count) と
 * point 報酬 (amount) — が、バックエンド + プラグインで正しく解釈されることを確認する。
 *
 * 確認内容:
 *  SP-1: stat 条件 (minecraft:mined / minecraft:stone, count=2) のクエストが、
 *        ボットが石を2個採掘したときに完了する
 *  SP-2: 完了後に /quest claim すると point 報酬 (50pt) が記録される
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const BOT_NAME = 'SpBot' + Math.floor(Math.random() * 100000)
const MINE_COUNT = 2
const POINT_REWARD = 50

interface QuestProgress {
  completed: boolean
  progress?: Array<{ conditionId: string; completed: boolean; current?: number; required?: number }>
}
interface RewardsResp {
  totalsByType: Record<string, number>
  items: Array<{ questId: number; rewardType: string; amount: number }>
}

/** ボットのすぐ隣に石を置き、採掘させる。statistic (MINE_BLOCK) が増加し stat 条件が進む。 */
async function mineStoneNextTo(bot: Bot, label: string) {
  const pos = bot.entity.position.floored()
  // ボットの足元から +x 側のすぐ隣 (+2) に石を設置する。
  // 遠い位置 (+4/+5) だとサバイバルのリーチ限界近くになり、フルスイート実行時に
  // 立ち位置が僅かにずれただけでサーバーが採掘を拒否 → statistic が増えず
  // current が required に届かない (CI の SP-1 恒常失敗の原因)。
  // 直前の採掘で同じ場所が空くので、毎回同じ +2 に置き直せばよい。
  const target = pos.offset(2, 0, 0)
  const setCmd = `setblock ${target.x} ${target.y} ${target.z} minecraft:stone`
  await rcon(setCmd).catch(() => {})
  await new Promise((r) => setTimeout(r, 400))

  const block = bot.blockAt(target)
  if (!block || block.name !== 'stone') {
    // 念のため再取得
    await new Promise((r) => setTimeout(r, 500))
  }
  const b = bot.blockAt(target)
  assert.ok(b && b.name === 'stone', `石が設置されていない (${label}): ${b?.name}`)
  // 石を採掘 (ダイアのツルハシを支給済みなので一瞬で壊れる)
  await bot.dig(b as any, true)
  await new Promise((r) => setTimeout(r, 400))
}

describe('stat 条件 + point 報酬 (MC-SP)', () => {
  let bot: Bot
  let token: string
  let uuid: string
  let questId: number
  const condId = `cond-sp-${Date.now()}`

  before(async () => {
    bot = await createBot(BOT_NAME)
    await new Promise((r) => setTimeout(r, 1500))

    await rcon(`op ${BOT_NAME}`).catch(() => {})
    await rcon(`gamemode survival ${BOT_NAME}`).catch(() => {})
    // 採掘を一瞬で終わらせるためダイアのツルハシを支給
    await rcon(`give ${BOT_NAME} minecraft:diamond_pickaxe`).catch(() => {})
    await new Promise((r) => setTimeout(r, 800))
    // give だけでは手に持たないので明示的に装備する (素手だと石1個 ≈7.5秒かかり
    // 2個で完了チャットの 20 秒タイムアウトを圧迫する)
    const pickaxe = bot.inventory.items().find((i) => i.name === 'diamond_pickaxe')
    if (pickaxe) await bot.equip(pickaxe, 'hand').catch(() => {})
    // point 報酬コマンドが参照する scoreboard objective を用意 (設定デフォルト挙動)
    await rcon(`scoreboard objectives add point dummy "ポイント"`).catch(() => {})
    await rcon(`scoreboard players set ${BOT_NAME} point 0`).catch(() => {})
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
    uuid = body.playerUuid

    // stat 条件 (石を2個採掘) + point 報酬 (50pt) のクエストを作成
    const { status: cs, body: created } = await apiRequest<{ id: number }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `SPテスト_${Date.now()}`,
          status: 'public',
          icon: 'stone',
          prerequisites: [],
          conditions: [{
            id: condId,
            type: 'stat',
            statType: 'minecraft:mined',
            statId: 'minecraft:stone',
            count: MINE_COUNT,
          }],
          rewards: [{ type: 'point', amount: POINT_REWARD }],
          mapPosition: { x: 820, y: 820 },
          category: null,
          customButtons: [],
        },
      },
    )
    assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
    questId = created.id
    console.log(`SPテストクエスト作成: id=${questId}, stat=mined/stone ×${MINE_COUNT}, point=${POINT_REWARD}`)
  })

  after(async () => {
    if (questId && token) {
      await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    }
    await rcon(`scoreboard objectives remove point`).catch(() => {})
    if (bot) await quitBot(bot)
  })

  it('SP-1: 石を規定数採掘すると stat 条件クエストが完了する', async () => {
    const chatPromise = waitForChat(
      bot,
      (t) => t.includes('クエスト完了') || t.includes('✨'),
      20000,
    ).catch(() => null)

    for (let i = 0; i < MINE_COUNT; i++) {
      await mineStoneNextTo(bot, i === 0 ? 'a' : 'b')
    }

    const mcChat = await chatPromise
    console.log('完了チャット:', mcChat ? JSON.stringify(mcChat) : '(届かず)')

    // stat イベント処理〜DB反映の遅延を吸収するため、完了までポーリングする
    let status = 0
    let body: QuestProgress = { completed: false }
    for (let i = 0; i < 10; i++) {
      ;({ status, body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token }))
      if (status === 200 && body.completed) break
      await new Promise((r) => setTimeout(r, 1000))
    }
    console.log('進捗API:', status, JSON.stringify(body))

    assert.ok(
      mcChat || (status === 200 && body.completed),
      `石を${MINE_COUNT}個採掘してもクエストが完了しない。stat 条件 (statType/statId/count) の解釈または StatProgressListener 起因の可能性。チャット=${JSON.stringify(mcChat)}, API=${JSON.stringify(body)}`,
    )
  })

  it('SP-2: claim すると point 報酬が reward_claims に記録される', async () => {
    // 完了近辺のタイミングばらつきを吸収
    await new Promise((r) => setTimeout(r, 800))
    bot.chat(`/quest claim ${questId}`)
    await new Promise((r) => setTimeout(r, 1500))

    const { status, body } = await apiRequest<RewardsResp>('GET', `/api/players/${uuid}/rewards`)
    assert.equal(status, 200, `rewards 取得失敗: ${JSON.stringify(body)}`)
    assert.ok(
      (body.totalsByType['point'] ?? 0) >= POINT_REWARD,
      `point 報酬が記録されていない: ${JSON.stringify(body.totalsByType)}`,
    )
    assert.ok(
      body.items.some((i) => i.questId === questId && i.rewardType === 'point' && i.amount === POINT_REWARD),
      `明細に point 報酬 (${POINT_REWARD}pt) がない: ${JSON.stringify(body.items)}`,
    )
    console.log('point 報酬記録:', JSON.stringify(body.totalsByType))
  })
})
