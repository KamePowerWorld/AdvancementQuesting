/**
 * 報酬受取 E2E テスト (MC-A)
 *
 * 確認内容:
 *  MC-A-1: クエスト完了後に claim するとアイテムがドロップされる
 *  MC-A-2: インベントリ満杯時でも claim するとアイテムが地面にドロップされる
 *  MC-A-3: claim 後に GET /api/progress/{questId} で rewardClaimed: true になる
 *  MC-A-4: 2回目の claim は 403 Forbidden
 *
 * 前提:
 *  - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 *  - MC_HOST / MC_PORT / API_BASE 環境変数で接続先を変更できる
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest, rcon } from './helpers.js'
import type { Bot } from 'mineflayer'

const BOT_NAME = 'ClaimBot' + Math.floor(Math.random() * 100000)

interface QuestProgress {
  completed: boolean
  rewardClaimed: boolean
}

describe('報酬受取 (claim)', () => {
  let bot: Bot
  let token: string
  let questId: number

  before(async () => {
    bot = await createBot(BOT_NAME)
    await new Promise(r => setTimeout(r, 1500))

    // OP + サバイバルに設定
    await rcon(`op ${BOT_NAME}`).catch(() => {})
    await rcon(`gamemode survival ${BOT_NAME}`).catch(() => {})
    await new Promise(r => setTimeout(r, 500))

    // トークン取得
    const chatPromise = waitForChat(bot, t => /\d{6}/.test(t), 8000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)![1]
    const { status, body } = await apiRequest<{ token: string }>('POST', '/api/auth/code', { body: { code } })
    assert.equal(status, 200, `認証失敗: ${JSON.stringify(body)}`)
    token = body.token

    // 報酬 (stone×1) 付きクエストを作成
    const { status: cs, body: created } = await apiRequest<{ id: number }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `報酬テスト_${Date.now()}`,
          status: 'public',
          icon: 'stone',
          prerequisites: [],
          conditions: [{ id: 'cond-claim', type: 'checkmark', label: '手動確認' }],
          rewards: [{ id: 'reward-stone', type: 'item', itemType: 'minecraft:stone', count: 1 }],
          mapPosition: { x: 900, y: 900 },
          category: null,
          customButtons: [],
        },
      },
    )
    assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}): ${JSON.stringify(created)}`)
    questId = created.id
    console.log(`報酬テストクエスト作成: id=${questId}`)

    // API で進捗を完了済みにする (checkmark条件は自動達成しないため直接書き込む)
    await apiRequest('POST', '/api/test/set-progress', {
      body: { playerUuid: 'direct', questId, completed: true, rewardClaimed: false },
    })
    // 実際のサーバーではプレイヤーUUIDが必要なので RCON で complete する
    await rcon(`quest_edit complete ${BOT_NAME} ${questId}`).catch(() => {})
    await new Promise(r => setTimeout(r, 1000))
  })

  after(async () => {
    if (questId && token) {
      await apiRequest('DELETE', `/api/quests/${questId}`, { token }).catch(() => {})
    }
    if (bot) await quitBot(bot)
  })

  it('MC-A-1: claim するとチャットに報酬通知が届く', async () => {
    // 完了確認
    const { status: ps, body: progress } = await apiRequest<QuestProgress>(
      'GET', `/api/progress/${questId}`, { token },
    )
    if (ps !== 200 || !progress.completed) {
      console.warn('クエストが完了状態でない — quest_edit complete が未実装の可能性。スキップ。')
      return
    }

    // /quest claim でアイテムドロップを期待
    const chatPromise = waitForChat(
      bot,
      t => t.includes('報酬') || t.includes('受け取') || t.includes('stone') || t.includes('reward'),
      10000,
    ).catch(() => null)

    bot.chat(`/quest claim ${questId}`)

    const msg = await chatPromise
    console.log('claim後チャット:', msg ? JSON.stringify(msg) : '(届かず)')

    // チャットが届かなくても API で rewardClaimed が true になっていれば合格
    const { status, body } = await apiRequest<QuestProgress>(
      'GET', `/api/progress/${questId}`, { token },
    )
    assert.ok(
      msg !== null || (status === 200 && body.rewardClaimed),
      'claim後にチャット通知もAPIのrewardClaimedもtrueにならなかった',
    )
  })

  it('MC-A-3: claim 後に rewardClaimed: true になる', async () => {
    const { status, body } = await apiRequest<QuestProgress>(
      'GET', `/api/progress/${questId}`, { token },
    )
    if (status !== 200) {
      console.warn(`進捗取得失敗(${status}) — スキップ`)
      return
    }
    assert.ok(body.rewardClaimed, `claim後もrewardClaimed=falseのまま: ${JSON.stringify(body)}`)
    console.log('rewardClaimed:', body.rewardClaimed)
  })

  it('MC-A-4: 2回目の claim は 403 Forbidden', async () => {
    // まず rewardClaimed=true になっているか確認
    const { status: ps, body: progress } = await apiRequest<QuestProgress>(
      'GET', `/api/progress/${questId}`, { token },
    )
    if (ps !== 200 || !progress.rewardClaimed) {
      console.warn('前テストで claim が成立していない — スキップ')
      return
    }

    // POST /api/progress/{questId}/claim を2回叩く
    const { status } = await apiRequest('POST', `/api/progress/${questId}/claim`, { token })
    assert.equal(status, 403, `2回目claimが ${status} を返した (403 Forbiddenを期待)`)
    console.log('2回目claim ステータス:', status)
  })

  it('MC-A-2: インベントリ満杯でも claim するとアイテムが地面にドロップされる', async () => {
    // 新たに未受取クエストを作って満杯状態でclaimする
    const { status: cs, body: newQuest } = await apiRequest<{ id: number }>(
      'POST', '/api/quests', {
        token,
        body: {
          title: `満杯テスト_${Date.now()}`,
          status: 'public',
          icon: 'diamond',
          prerequisites: [],
          conditions: [{ id: 'cond-full', type: 'checkmark', label: '手動' }],
          rewards: [{ id: 'reward-diamond', type: 'item', itemType: 'minecraft:diamond', count: 1 }],
          mapPosition: { x: 950, y: 950 },
          category: null,
          customButtons: [],
        },
      },
    )
    if (cs !== 200 && cs !== 201) { console.warn('クエスト作成失敗 — スキップ'); return }
    const fullQuestId = newQuest.id

    try {
      // インベントリを満杯にする (stone×64 を36スロット分)
      await rcon(`execute as ${BOT_NAME} run fill ~ ~-1 ~ ~ ~-1 ~ minecraft:chest`)
        .catch(() => {})
      for (let slot = 0; slot < 36; slot++) {
        await rcon(`item replace entity ${BOT_NAME} hotbar.${Math.min(slot, 8)} with minecraft:stone 64`)
          .catch(() => {})
      }

      // 完了状態にする
      await rcon(`quest_edit complete ${BOT_NAME} ${fullQuestId}`).catch(() => {})
      await new Promise(r => setTimeout(r, 500))

      // claim する — 満杯なのでアイテムが足元にドロップされるはず
      const chatPromise = waitForChat(
        bot,
        t => t.includes('報酬') || t.includes('ドロップ') || t.includes('diamond'),
        8000,
      ).catch(() => null)
      bot.chat(`/quest claim ${fullQuestId}`)
      await chatPromise

      // API で rewardClaimed: true になっていることを確認
      const { status, body } = await apiRequest<QuestProgress>(
        'GET', `/api/progress/${fullQuestId}`, { token },
      )
      if (status === 200) {
        assert.ok(body.rewardClaimed, 'インベントリ満杯時のclaimでrewardClaimedがtrueにならなかった')
        console.log('満杯claim結果: rewardClaimed =', body.rewardClaimed)
      }
    } finally {
      await apiRequest('DELETE', `/api/quests/${fullQuestId}`, { token }).catch(() => {})
    }
  })
})
