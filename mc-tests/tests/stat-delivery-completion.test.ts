/**
 * 統計 + 納品 混在クエストの完了判定 E2E テスト (回帰テスト)
 *
 * 再現するバグ:
 *   統計タスク(ジャンプ×5) と 納品タスク(bread×3) を持つクエストで、
 *   統計タスクだけ達成した時点でクエスト全体が「完了」扱いになり、
 *   納品していないのに報酬受取が可能になっていた。
 *   (原因: ConditionEvaluator.isAllConditionsMet が delivery 条件をスキップしていた)
 *
 * 期待動作:
 *   MC-SD-1: 統計だけ達成 → クエストは未完了 (delivery が残っているため)
 *   MC-SD-2: 納品も完了 → クエスト完了
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const BOT_NAME = 'SdBot' + Math.floor(Math.random() * 100000)
const JUMP_COUNT = 5
const ITEM_TYPE = 'minecraft:bread'
const DELIVER_COUNT = 3
const STAT_COND = `cond-sd-stat-${Date.now()}`
const DELIVERY_COND = `cond-sd-deliver-${Date.now()}`

interface QuestProgress {
  completed: boolean
  progress?: Array<{ conditionId: string; completed: boolean; current?: number; required?: number }>
}

/** ボットが地上にいる (安定して着地済み) になるまで待つ */
async function waitForGround(bot: Bot, timeoutMs = 3000) {
  const start = Date.now()
  let stable = 0
  while (Date.now() - start < timeoutMs) {
    if (bot.entity.onGround && bot.entity.velocity.y === 0) {
      stable++
      if (stable >= 2) return true
    } else {
      stable = 0
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

/** ボットを指定回数ジャンプさせる */
async function jumpMultipleTimes(bot: Bot, count: number) {
  for (let i = 0; i < count; i++) {
    await waitForGround(bot)
    bot.setControlState('jump', true)
    await new Promise((r) => setTimeout(r, 100))
    bot.setControlState('jump', false)
    await waitForGround(bot)
  }
}

describe('統計+納品 混在クエストの完了判定 (MC-SD)', () => {
  let bot: Bot
  let token: string
  let questId: number

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
    const { status, body } = await apiRequest<{ token: string }>(
      'POST', '/api/auth/code', { body: { code } },
    )
    assert.equal(status, 200, `認証失敗: ${JSON.stringify(body)}`)
    token = body.token

    const { body: me } = await apiRequest<{ role: string }>('GET', '/api/auth/me', { token })
    assert.equal(me.role, 'editor', 'editor 権限が必要（クエスト作成のため）')

    // 統計(ジャンプ5回) + 納品(bread×3) のクエストを作成
    const { status: cs, body: created } = await apiRequest<{ id: number }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `SDテスト_${Date.now()}`,
          description: `ジャンプ${JUMP_COUNT}回 + ${ITEM_TYPE}を${DELIVER_COUNT}個納品`,
          status: 'public',
          icon: 'rabbit_foot',
          prerequisites: [],
          conditions: [
            { id: STAT_COND, type: 'stat', statType: 'minecraft:custom', statId: 'minecraft:jump', count: JUMP_COUNT },
            { id: DELIVERY_COND, type: 'delivery', itemType: ITEM_TYPE, count: DELIVER_COUNT },
          ],
          rewards: [],
          mapPosition: { x: 55, y: 55 },
          category: 'テスト',
          customButtons: [],
        },
      },
    )
    assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
    questId = created.id
    console.log(`SDテストクエスト作成: id=${questId}, stat=jump×${JUMP_COUNT} + delivery=bread×${DELIVER_COUNT}`)
  })

  after(async () => {
    if (questId && token) {
      await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    }
    if (bot) await quitBot(bot)
  })

  it('MC-SD-1: 統計だけ達成しても納品が残っていればクエストは未完了', async () => {
    await jumpMultipleTimes(bot, JUMP_COUNT)

    // 統計イベント反映を待ちつつ進捗をポーリング
    let body: QuestProgress | undefined
    for (let i = 0; i < 12; i++) {
      ;({ body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token }))
      const statCond = body?.progress?.find((p) => p.conditionId === STAT_COND)
      if (statCond?.completed) break
      await new Promise((r) => setTimeout(r, 500))
    }
    console.log('統計達成後の進捗:', JSON.stringify(body))

    const statCond = body?.progress?.find((p) => p.conditionId === STAT_COND)
    assert.equal(statCond?.completed, true, `統計タスクは完了しているはず (jump×${JUMP_COUNT})`)

    // ここがバグの核心: 納品していないのでクエスト全体は未完了でなければならない
    assert.equal(body?.completed, false,
      `納品タスクが未完了なのにクエストが完了扱いになっている (バグ再現)。progress=${JSON.stringify(body)}`)

    // 報酬受取も拒否されるはず
    const { body: claim } = await apiRequest<{ claimed?: number }>(
      'POST', `/api/progress/${questId}/claim`, { token },
    )
    assert.notEqual(claim?.claimed, 1, '未完了クエストの報酬は受け取れないはず')
  })

  it('MC-SD-2: 納品も完了するとクエストが完了する', async () => {
    bot.chat(`/clear ${BOT_NAME}`)
    await new Promise((r) => setTimeout(r, 500))
    bot.chat(`/give ${BOT_NAME} ${ITEM_TYPE} ${DELIVER_COUNT}`)
    await new Promise((r) => setTimeout(r, 2000))

    const { status, body: deliverResult } = await apiRequest<{ delivered: Record<string, number> }>(
      'POST', `/api/progress/${questId}/deliver`, { token },
    )
    assert.equal(status, 200)
    assert.equal(deliverResult.delivered[DELIVERY_COND], DELIVER_COUNT, `${DELIVER_COUNT}個納品されるはず`)

    const { body } = await apiRequest<QuestProgress>('GET', `/api/progress/${questId}`, { token })
    console.log('納品後の進捗:', JSON.stringify(body))
    assert.equal(body.completed, true, '統計+納品が両方完了したのでクエスト完了のはず')
  })
})
