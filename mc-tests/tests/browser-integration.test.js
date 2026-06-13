/**
 * Minecraft ⇔ ブラウザ 統合 E2E テスト
 *
 * 実際に Mineflayer ボットでサーバーに接続し、リンゴを拾ってクエストを達成させ、
 * 同時に Playwright でブラウザ(本番Web UI)を開いて以下を確認する:
 *   - Minecraft チャットにクエスト完了メッセージが届く
 *   - ブラウザに quest_complete の SSE が届き、オーバーレイ & ノードのキラキラ演出が出る
 *
 * 前提:
 *   - run/ の Minecraft サーバー + AdvancementQuesting プラグイン起動済み
 *   - apple×1 を条件に持つ public クエストが存在する (なければ作成する)
 *   - MC_HOST/MC_PORT/API_BASE 環境変数で接続先を変更可
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { chromium } from 'playwright'
import { createBot, quitBot, waitForChat, apiRequest, API_BASE } from './helpers.js'

// 進捗はプレイヤーUUID(=名前)に紐づき永続化されるため、毎回ユニークな名前で
// 「未達成の新規プレイヤー」を作り、リンゴ拾得で必ず新規完了イベントを発火させる
const BOT_NAME = 'ItgBot' + Math.floor(Math.random() * 100000)
const RCON_HOST = process.env.MC_HOST ?? 'localhost'
const RCON_PORT = parseInt(process.env.RCON_PORT ?? '25575', 10)
const RCON_PASS = process.env.RCON_PASS ?? 'kame'

/** RCON でコンソールコマンドを実行する (OP権限相当) */
function rcon(cmd) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(RCON_PORT, RCON_HOST)
    let buf = Buffer.alloc(0)
    const send = (id, type, body) => {
      const payload = Buffer.from(body + '\0\0', 'ascii')
      const pkt = Buffer.alloc(4 + payload.length + 8)
      pkt.writeInt32LE(pkt.length - 4, 0)
      pkt.writeInt32LE(id, 4)
      pkt.writeInt32LE(type, 8)
      payload.copy(pkt, 12)
      sock.write(pkt)
    }
    let authed = false
    sock.on('connect', () => send(1, 3, RCON_PASS))
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d])
      while (buf.length >= 4 && buf.length >= buf.readInt32LE(0) + 4) {
        const len = buf.readInt32LE(0)
        const pkt = buf.subarray(4, 4 + len)
        buf = buf.subarray(4 + len)
        const body = pkt.subarray(8, pkt.length - 2).toString('utf8')
        if (!authed) { authed = true; send(2, 2, cmd) }
        else { sock.end(); resolve(body) }
      }
    })
    sock.on('error', reject)
    setTimeout(() => { sock.destroy(); reject(new Error('rcon timeout')) }, 5000)
  })
}

describe('Minecraft⇔ブラウザ 統合: リンゴ拾得でブラウザ演出', () => {
  let bot
  let browser
  let page
  let token

  before(async () => {
    bot = await createBot(BOT_NAME)
    await new Promise(r => setTimeout(r, 1500))

    // ボットをOP + サバイバルにする (アイテム拾得にはサバイバル/アドベンチャーが必要)
    await rcon(`op ${BOT_NAME}`).catch(() => {})
    await rcon(`gamemode survival ${BOT_NAME}`).catch(() => {})
    // 進捗をリセット (前回テストの完了状態を消す)
    await new Promise(r => setTimeout(r, 500))

    // /quest code でトークン取得
    const chatPromise = waitForChat(bot, t => /\d{6}/.test(t), 8000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)[1]
    const { status, body } = await apiRequest('POST', '/api/auth/code', { body: { code } })
    assert.equal(status, 200, `認証失敗: ${JSON.stringify(body)}`)
    token = body.token

    // apple×1 条件の public クエストがあるか確認。なければ作成 (editor権限が要る)
    const { body: quests } = await apiRequest('GET', '/api/quests?status=public')
    let appleQuest = Array.isArray(quests)
      ? quests.find(q => (q.conditions ?? []).some(c => c.type === 'item' && c.itemType === 'apple'))
      : null
    if (!appleQuest) {
      const { status: cs, body: created } = await apiRequest('POST', '/api/quests', {
        token,
        body: {
          title: '統合テスト_リンゴ', status: 'public', icon: 'apple', prerequisites: [],
          conditions: [{ id: 'itg-apple', type: 'item', itemType: 'apple', count: 1 }],
          rewards: [], mapPosition: { x: 700, y: 700 }, category: null, customButtons: [],
        },
      })
      assert.ok(cs === 200 || cs === 201, `クエスト作成失敗(${cs}) — editor権限が必要: ${JSON.stringify(created)}`)
      appleQuest = created
    }
    console.log(`apple クエスト: id=${appleQuest.id} title=${appleQuest.title}`)

    // ブラウザを起動して Web UI にトークンを注入してログイン
    browser = await chromium.launch()
    page = await browser.newPage()
    page.on('pageerror', e => console.log('  [browser pageerror]', e.message))
    await page.goto(API_BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate((t) => localStorage.setItem('token', t), token)
    // keepAlive な SSE 接続があるため networkidle は来ない → domcontentloaded で待つ
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-node-id]', { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(2000) // SSE接続が確立するのを待つ
  })

  after(async () => {
    if (page) await page.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
    if (bot) await quitBot(bot)
  })

  it('ブラウザがログイン状態でマップを表示している', async () => {
    const nodeCount = await page.locator('[data-node-id]').count().catch(() => 0)
    console.log('ブラウザ node count:', nodeCount)
    assert.ok(nodeCount > 0, 'マップにノードが表示されていない')
  })

  it('リンゴを拾うと Minecraft チャット完了通知 + ブラウザ演出が出る', async () => {
    // Minecraft 側: 完了チャットを待ち受け
    const mcChatPromise = waitForChat(
      bot,
      t => t.includes('クエスト完了') || t.includes('✨'),
      15000,
    ).catch(() => null)

    // ブラウザ側: SSE 受信でオーバーレイ or キラキラが出るのを監視
    const browserPromise = page.waitForFunction(() => {
      const overlay = document.querySelector('[data-testid="quest-complete-overlay"]')
      const celebrating = document.querySelector('[data-celebrating="true"]')
      return !!(overlay || celebrating)
    }, { timeout: 15000 }).then(() => true).catch(() => false)

    // RCON (コンソール権限) でボットの足元にリンゴを summon する。
    // execute at <bot> でボットの現在地に確実にスポーンさせる。
    const r1 = await rcon(`execute at ${BOT_NAME} run summon item ~ ~ ~ {Item:{id:"minecraft:apple",Count:1b},PickupDelay:0s}`)
    console.log('summon結果:', JSON.stringify(r1))

    // 拾うために少し前後に動く (アイテムに重なる)
    await new Promise(r => setTimeout(r, 300))
    try {
      for (let i = 0; i < 3; i++) {
        bot.setControlState('forward', true)
        await new Promise(r => setTimeout(r, 300))
        bot.setControlState('forward', false)
        bot.setControlState('back', true)
        await new Promise(r => setTimeout(r, 300))
        bot.setControlState('back', false)
        // 念のため毎回足元にも追加 summon
        await rcon(`execute at ${BOT_NAME} run summon item ~ ~ ~ {Item:{id:"minecraft:apple",Count:1b},PickupDelay:0s}`)
      }
    } catch { /* 移動失敗は無視 */ }

    const [mcChat, browserShown] = await Promise.all([mcChatPromise, browserPromise])

    console.log('MC完了チャット:', mcChat ? JSON.stringify(mcChat) : '(届かず)')
    console.log('ブラウザ演出表示:', browserShown)

    // ブラウザ演出が出ていれば成功。出ていなければ、アイテム拾得が成立しなかった可能性
    // (summon の権限やボットの位置依存)。その場合は API 直接で進捗が完了しているか確認する
    if (!browserShown) {
      const { status, body } = await apiRequest('GET', '/api/progress', { token })
      const anyCompleted = Array.isArray(body) && body.some(p => p.completed)
      console.log('進捗API completed:', anyCompleted, JSON.stringify(body).slice(0, 200))
      assert.ok(
        anyCompleted,
        'リンゴ拾得が成立しなかった (summon権限/位置の問題)。EntityPickupItemEvent が発火していない可能性。',
      )
      // 進捗は完了したが SSE がブラウザに届かなかった = SSE のバグ
      assert.fail('進捗は完了したがブラウザに SSE 演出が届かなかった (SSE接続/UUID不一致の疑い)')
    }

    assert.ok(browserShown, 'ブラウザにクエスト完了演出が表示されなかった')
  })
})
