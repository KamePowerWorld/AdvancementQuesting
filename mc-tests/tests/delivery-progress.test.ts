/**
 * 納品 (delivery) 進捗 E2E テスト
 *
 * 確認内容:
 *  1. delivery 条件付きクエストを作成する
 *  2. ボットに /give でアイテムを与える (delivery はインベントリを直接読むので give で足りる)
 *  3. POST /api/progress/{questId}/deliver で納品し、消費数と進捗を確認する
 *  4. 部分納品 → 追加納品で完了することを確認する
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const ITEM_TYPE = 'minecraft:bread'
const REQUIRED = 5
const COND_ID = 'cond-delivery-1'

describe('納品 (delivery) 進捗 (MC-DV)', () => {
  let bot: Bot
  let token: string
  let questId: number | undefined

  before(async () => {
    bot = await createBot('DeliverBot')
    await new Promise(r => setTimeout(r, 1500))

    // OP + サバイバルに設定 (editor 権限のコード発行と /give に必要)
    await rcon(`op DeliverBot`).catch(() => {})
    await rcon(`gamemode survival DeliverBot`).catch(() => {})
    await new Promise(r => setTimeout(r, 500))

    const chatPromise = waitForChat(bot, text => /\d{6}/.test(text), 8000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)![1]

    const { status: authStatus, body: authBody } = await apiRequest<{ token: string }>(
      'POST', '/api/auth/code', { body: { code } },
    )
    assert.equal(authStatus, 200, `認証失敗: ${JSON.stringify(authBody)}`)
    token = authBody.token

    const { body: me } = await apiRequest<{ role: string }>('GET', '/api/auth/me', { token })
    if (me.role !== 'editor') {
      console.warn('editor 権限がないため delivery クエストを作成できません。テストをスキップします。')
      return
    }

    const { status: createStatus, body: quest } = await apiRequest<{ id: number; title: string }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `納品テスト_${Date.now()}`,
          description: `${ITEM_TYPE} を ${REQUIRED} 個納品するクエスト`,
          status: 'public',
          icon: ITEM_TYPE,
          conditions: [{ id: COND_ID, type: 'delivery', itemType: ITEM_TYPE, count: REQUIRED }],
          rewards: [],
          prerequisites: [],
          mapPosition: { x: 600, y: 600 },
          category: null,
          customButtons: [],
        },
      },
    )
    assert.ok(createStatus === 200 || createStatus === 201,
      `クエスト作成失敗 (${createStatus}): ${JSON.stringify(quest)}`)
    questId = quest.id
    console.log(`作成したクエスト: id=${questId}, title=${quest.title}`)
  })

  after(async () => {
    if (questId && token) {
      await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    }
    if (bot) await quitBot(bot)
  })

  it('MC-DV-1: 手持ちが無い状態で納品すると failed に必要数が返る', async () => {
    if (!questId) { console.warn('questId 未設定 — スキップ'); return }

    // インベントリをクリア
    bot.chat('/clear @s')
    await new Promise(r => setTimeout(r, 1000))

    const { status, body } = await apiRequest<{ delivered: Record<string, number>; failed: Record<string, number> }>(
      'POST', `/api/progress/${questId}/deliver`, { token },
    )
    assert.equal(status, 200)
    assert.equal(Object.keys(body.delivered).length, 0, '納品されないはず')
    assert.equal(body.failed[COND_ID], REQUIRED, `failed に必要数 ${REQUIRED} が返るはず`)
  })

  it('MC-DV-2: 部分納品でインベントリから消費され current が更新される', async () => {
    if (!questId) { console.warn('questId 未設定 — スキップ'); return }

    bot.chat(`/give DeliverBot ${ITEM_TYPE} 2`)
    await new Promise(r => setTimeout(r, 2000))

    const { status, body } = await apiRequest<{ delivered: Record<string, number>; failed: Record<string, number> }>(
      'POST', `/api/progress/${questId}/deliver`, { token },
    )
    assert.equal(status, 200)
    assert.equal(body.delivered[COND_ID], 2, '2個納品されるはず')

    const { body: progress } = await apiRequest<{ completed?: boolean; progress?: Array<{ conditionId: string; current?: number; completed?: boolean }> }>(
      'GET', `/api/progress/${questId}`, { token },
    )
    const cond = progress.progress?.find(p => p.conditionId === COND_ID)
    assert.ok(cond, '進捗レコードがあるはず')
    assert.equal(cond!.current, 2)
    assert.equal(cond!.completed, false, 'まだ未完了のはず')
  })

  it('MC-DV-3: 残数を納品するとクエストが完了する', async () => {
    if (!questId) { console.warn('questId 未設定 — スキップ'); return }

    bot.chat(`/give DeliverBot ${ITEM_TYPE} ${REQUIRED}`)  // 余分に持っていても必要数だけ消費される
    await new Promise(r => setTimeout(r, 2000))

    const { status, body } = await apiRequest<{ delivered: Record<string, number> }>(
      'POST', `/api/progress/${questId}/deliver`, { token },
    )
    assert.equal(status, 200)
    assert.equal(body.delivered[COND_ID], REQUIRED - 2, `残り ${REQUIRED - 2} 個だけ消費されるはず`)

    const { body: progress } = await apiRequest<{ completed?: boolean; progress?: Array<{ conditionId: string; current?: number; completed?: boolean }> }>(
      'GET', `/api/progress/${questId}`, { token },
    )
    const cond = progress.progress?.find(p => p.conditionId === COND_ID)
    assert.equal(cond!.current, REQUIRED)
    assert.equal(cond!.completed, true, '条件完了のはず')
    assert.equal(progress.completed, true, 'クエスト完了のはず')
  })

  it('MC-DV-4: 完了後の再納品は消費されない', async () => {
    if (!questId) { console.warn('questId 未設定 — スキップ'); return }

    bot.chat(`/give DeliverBot ${ITEM_TYPE} 1`)
    await new Promise(r => setTimeout(r, 2000))

    const { status, body } = await apiRequest<{ delivered: Record<string, number>; failed: Record<string, number> }>(
      'POST', `/api/progress/${questId}/deliver`, { token },
    )
    assert.equal(status, 200)
    assert.equal(Object.keys(body.delivered).length, 0, '完了済みなので納品されないはず')
    assert.equal(Object.keys(body.failed).length, 0, '完了済みなので failed にも入らないはず')
  })
})
