/**
 * /quest コマンド E2E テスト
 *
 * 前提: Minecraft サーバー (run/) と AdvancementQuesting プラグインが起動済みであること
 * MC_HOST / MC_PORT / API_BASE 環境変数で接続先を変更できる
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createBot, quitBot, waitForChat, apiRequest } from './helpers.js'

describe('/quest コマンド & 認証 API', () => {
  let bot

  before(async () => {
    bot = await createBot('TestPlayer')
    // スポーン直後は少し待ってチャットを安定させる
    await new Promise(r => setTimeout(r, 1000))
  })

  after(async () => {
    if (bot) await quitBot(bot)
  })

  // -----------------------------------------------------------------------

  it('/quest でコード付きログインURLがチャットに表示される', async () => {
    const chatPromise = waitForChat(bot, text => text.includes('http'), 5000)
    bot.chat('/quest')
    const msg = await chatPromise
    assert.ok(msg.includes('http'), `URLが含まれていない: "${msg}"`)
    assert.ok(msg.includes('code=') && /code=\d{6}/.test(msg), `code=XXXXXXが含まれていない: "${msg}"`)
  })

  it('/quest code で6桁コードがチャットに表示される', async () => {
    const chatPromise = waitForChat(bot, text => /\d{6}/.test(text), 5000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const match = msg.match(/(\d{6})/)
    assert.ok(match, `6桁コードが含まれていない: "${msg}"`)
  })

  it('/quest code → POST /api/auth/code → セッション取得できる', async () => {
    // チャットからコードを取得
    const chatPromise = waitForChat(bot, text => /\d{6}/.test(text), 5000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)[1]

    // コードで認証
    const { status, body } = await apiRequest('POST', '/api/auth/code', { body: { code } })
    assert.equal(status, 200, `status: ${status}, body: ${JSON.stringify(body)}`)
    assert.ok(body.token, 'tokenが返っていない')
    assert.ok(body.playerUuid, 'playerUuidが返っていない')
    assert.equal(body.playerName, 'TestPlayer')
    assert.ok(['player', 'editor', 'admin'].includes(body.role), `不正なrole: ${body.role}`)
  })

  it('取得したトークンで GET /api/auth/me が返る', async () => {
    // 新たにコードを取得
    const chatPromise = waitForChat(bot, text => /\d{6}/.test(text), 5000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)[1]

    const { body: authBody } = await apiRequest('POST', '/api/auth/code', { body: { code } })
    const token = authBody.token

    // /me で確認
    const { status, body } = await apiRequest('GET', '/api/auth/me', { token })
    assert.equal(status, 200)
    assert.equal(body.playerName, 'TestPlayer')
    assert.ok(body.playerUuid)
  })

  it('DELETE /api/auth/logout でセッション削除 → 以降は /me が 401', async () => {
    const chatPromise = waitForChat(bot, text => /\d{6}/.test(text), 5000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)[1]

    const { body: authBody } = await apiRequest('POST', '/api/auth/code', { body: { code } })
    const token = authBody.token

    // ログアウト
    const { status: logoutStatus } = await apiRequest('DELETE', '/api/auth/logout', { token })
    assert.equal(logoutStatus, 204)

    // 以降は 401
    const { status: meStatus } = await apiRequest('GET', '/api/auth/me', { token })
    assert.equal(meStatus, 401)
  })

  it('無効なコードは POST /api/auth/code で 401 が返る', async () => {
    const { status } = await apiRequest('POST', '/api/auth/code', { body: { code: '000000' } })
    assert.equal(status, 401)
  })

  it('同じコードを2回使うと2回目は 401 になる', async () => {
    const chatPromise = waitForChat(bot, text => /\d{6}/.test(text), 5000)
    bot.chat('/quest code')
    const msg = await chatPromise
    const code = msg.match(/(\d{6})/)[1]

    const { status: s1 } = await apiRequest('POST', '/api/auth/code', { body: { code } })
    assert.equal(s1, 200)

    const { status: s2 } = await apiRequest('POST', '/api/auth/code', { body: { code } })
    assert.equal(s2, 401, 'コードの使い回しができてしまう')
  })
})

describe('GET /api/quests', () => {
  it('認証なしでクエスト一覧が取得できる', async () => {
    const { status, body } = await apiRequest('GET', '/api/quests')
    assert.equal(status, 200)
    assert.ok(Array.isArray(body), 'レスポンスが配列ではない')
  })

  it('status=public フィルタが動く', async () => {
    const { status, body } = await apiRequest('GET', '/api/quests?status=public')
    assert.equal(status, 200)
    assert.ok(Array.isArray(body))
    for (const q of body) {
      assert.equal(q.status, 'public', `publicでないクエストが含まれる: ${q.id}`)
    }
  })

  it('存在しないクエストIDは 404 が返る', async () => {
    const { status } = await apiRequest('GET', '/api/quests/99999')
    assert.equal(status, 404)
  })
})
