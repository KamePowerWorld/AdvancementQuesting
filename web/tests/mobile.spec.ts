/**
 * スマホサイズ (375×667 / iPhone SE) での E2E テスト
 *
 * ナビバーが狭い環境でボタンが正しく表示・操作できるかを検証する。
 *
 * W-H: スマホでの条件進捗・報酬受取
 *  M-A-1: スマホでモーダルを開くとタスクタブに条件一覧が表示される
 *  M-A-2: スマホで達成済み条件にチェックマークが表示される
 *  M-A-3: スマホで報酬受取ボタンが表示・タップできる
 */

import { test, expect, type Page } from '@playwright/test'
import {
  resetProgress, setProgress, setConditionProgress, notifyProgressUpdate,
  EDITOR_UUID, MOCK, PLAYER_UUID,
} from './helpers.js'

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

async function loginAs(page: Page, token: 'demo-editor-token' | 'demo-player-token') {
  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token } })
  await page.evaluate((t) => localStorage.setItem('token', t), token)
  await page.reload()
  await expect(page.locator('button[title*="クリックでログアウト"]')).toBeVisible({ timeout: 8000 })
  if (token === 'demo-editor-token') {
    await page.getByTitle('編集モード').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTitle('編集モード').click()
  }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

test.use({ viewport: { width: 375, height: 667 } })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// M-1. プレイヤー: 提案開始ボタンが見える (アイコンのみ)
test('スマホ: プレイヤー — 提案開始ボタンが表示される', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  // ✨ アイコンボタンが見える
  const propBtn = page.locator('nav button', { hasText: '✨' })
  await expect(propBtn).toBeVisible()
})

// M-2. プレイヤー: 提案モードON → 送信ボタンが見える
test('スマホ: プレイヤー — 提案モードONで送信ボタンが表示される', async ({ page }) => {
  await loginAs(page, 'demo-player-token')

  // 提案モード開始
  await page.locator('nav button', { hasText: '✨' }).click()

  // ✕ (終了ボタン) が見える
  await expect(page.locator('nav button', { hasText: '✕' })).toBeVisible()

  // ノード追加してドラフトを作る
  await page.getByTitle('クエストを追加').click()
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const baseCount = await page.locator('[data-node-id]').count()
  await canvas.click({ position: { x: 180, y: 300 } })
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount + 1, { timeout: 3000 })

  // 📤 送信ボタン (カウント付き) が見える
  const sendBtn = page.locator('nav button', { hasText: '📤' })
  await expect(sendBtn).toBeVisible()

  // ナビバー内に収まっていることを確認 (ボタンがビューポートからはみ出ていない)
  const navBox = await page.locator('nav').boundingBox()
  const sendBox = await sendBtn.boundingBox()
  expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(navBox!.x + navBox!.width + 1)
})

// M-3. プレイヤー: 送信ボタンをタップして送信できる
test('スマホ: プレイヤー — 送信ボタンをタップして提案を送信できる', async ({ page }) => {
  await loginAs(page, 'demo-player-token')

  await page.locator('nav button', { hasText: '✨' }).click()
  await page.getByTitle('クエストを追加').click()
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  await canvas.click({ position: { x: 180, y: 300 } })
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 3000 })

  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  // 送信後は送信ボタンが消える
  await expect(page.locator('nav button', { hasText: '📤' })).not.toBeVisible()
})

// M-4. editor: モード切り替えトグルがアイコンのみで表示される
test('スマホ: editor — ✏️/🎮 トグルアイコンが表示される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // ✏️ 編集ボタンと 🎮 プレイボタンがナビバーに見える
  const editBtn = page.locator('nav button[title="編集モード"]')
  const playBtn = page.locator('nav button[title="プレイモード"]')
  await expect(editBtn).toBeVisible()
  await expect(playBtn).toBeVisible()

  // テキスト「編集」「プレイ」は hidden sm:inline で非表示
  await expect(editBtn.locator('span.hidden')).toHaveText('編集')
  await expect(playBtn.locator('span.hidden')).toHaveText('プレイ')
})

// M-5. editor: プレイモードに切り替えると保存ボタンが消え、提案ボタンも出ない
test('スマホ: editor — プレイモードで保存ボタンが消える', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // 初期は編集モード → 保存ボタンあり
  await expect(page.getByText('💾 保存')).toBeVisible()

  // プレイモードに切り替え
  await page.locator('nav button[title="プレイモード"]').click()

  // 保存ボタンが消える
  await expect(page.getByText('💾 保存')).not.toBeVisible()
  // 提案ボタンも出ない (editor はプレイモードでも player にはならない)
  await expect(page.locator('nav button', { hasText: '✨' })).not.toBeVisible()

  // 編集モードに戻す
  await page.locator('nav button[title="編集モード"]').click()
  await expect(page.getByText('💾 保存')).toBeVisible()
})

// M-6. ナビバーがビューポートに収まっている (overflow なし)
test('スマホ: ナビバー全体がビューポート幅に収まる', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  // 提案モード開始 → ドラフト追加 → 送信ボタン表示まで待つ
  await page.locator('nav button', { hasText: '✨' }).click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(300)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const baseCount = await page.locator('[data-node-id]').count()
  await canvas.click({ position: { x: 180, y: 250 } })
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount + 1, { timeout: 8000 })
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 5000 })

  // ナビバーの scrollWidth が clientWidth を超えていないことを確認
  const overflow = await page.locator('nav').evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

// ---------------------------------------------------------------------------
// PCと同等の全シナリオ (スマホサイズで実行)
// ---------------------------------------------------------------------------

// M-7. ログイン→ログアウト→再ログインを繰り返す
test('スマホ: ログアウト→再ログインを繰り返しても正常に動く', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    // ログイン
    await page.locator('button[title="ログイン"]').click()
    await expect(page.getByPlaceholder('123456')).toBeVisible({ timeout: 3000 })
    await page.getByText('✏️ 編集者としてログイン').click()
    await expect(page.locator('button[title*="クリックでログアウト"]')).toBeVisible({ timeout: 8000 })
    // editor はデフォルトプレイモード → 編集モードに切り替えて保存ボタンを確認
    await page.getByTitle('編集モード').click()
    await expect(page.getByText('💾 保存')).toBeVisible()

    // ログアウト
    await page.locator('button[title*="クリックでログアウト"]').click()
    await expect(page.locator('button[title*="クリックでログアウト"]')).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText('💾 保存')).not.toBeVisible()
  }

  // プレイヤーとしてログインしても正常
  await page.locator('button[title="ログイン"]').click()
  await page.getByText('🎮 プレイヤーとしてログイン').click()
  await expect(page.locator('button[title*="クリックでログアウト"]')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('nav button', { hasText: '✨' })).toBeVisible()
})

// M-8. 編集者: 編集/プレイモード切り替え
test('スマホ: editor — 編集/プレイモードを切り替えるとツールバーが変わる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // 編集モード: 保存・移動・追加ツールがある
  await expect(page.getByText('💾 保存')).toBeVisible()
  await expect(page.getByTitle('移動')).toBeVisible()
  await expect(page.getByTitle('クエストを追加')).toBeVisible()

  // プレイモードへ切り替え
  await page.locator('nav button[title="プレイモード"]').click()
  await expect(page.getByText('💾 保存')).not.toBeVisible()
  await expect(page.getByTitle('移動')).not.toBeVisible()
  await expect(page.getByTitle('クエストを追加')).not.toBeVisible()

  // プレイモードでノードをクリック → 読み取り専用モーダルが開く
  const firstNode = page.locator('[data-node-id]').first()
  const nodeBox = await firstNode.boundingBox()
  await page.mouse.click(nodeBox!.x + nodeBox!.width / 2, nodeBox!.y + nodeBox!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 5000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: '閉じる' }).last().click()

  // 編集モードに戻す
  await page.locator('nav button[title="編集モード"]').click()
  await expect(page.getByText('💾 保存')).toBeVisible()
})

// M-9. プレイヤー: 提案送信フル
test('スマホ: プレイヤー — 提案モードON→ドラフト追加→送信→終了', async ({ page }) => {
  // 提案をリセットして安定したノード数を確保
  await page.request.post(`${MOCK}/api/test/reset-proposals`)

  await loginAs(page, 'demo-player-token')

  await page.locator('nav button', { hasText: '✨' }).click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(400)

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const baseCount = await page.locator('[data-node-id]').count()
  await canvas.click({ position: { x: 180, y: 250 } })
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount + 1, { timeout: 8000 })

  // 送信
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  // 終了: ドラフトノードが消えて送信済み提案ノードのみ残る
  await page.locator('nav button', { hasText: '✕' }).click()
  await expect(page.locator('[data-node-id^="draft-"]')).toHaveCount(0, { timeout: 3000 })
})

// M-10. 承認フル: 承認ボタンがスマホでも見えてクリックできる
test('スマホ: editor — 提案ノードの承認ボタンが表示されクリックできる', async ({ page }) => {
  // 事前に提案をリセット
  await page.request.post(`${MOCK}/api/test/reset-proposals`)

  // プレイヤーが提案
  await loginAs(page, 'demo-player-token')
  await page.locator('nav button', { hasText: '✨' }).click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  await canvas.click({ position: { x: 180, y: 350 } })
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 5000 })
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  // editor でログイン
  await page.locator('button[title*="クリックでログアウト"]').click()
  await expect(page.locator('button[title*="クリックでログアウト"]')).not.toBeVisible({ timeout: 5000 })
  await page.locator('button[title="ログイン"]').click()
  await page.getByText('✏️ 編集者としてログイン').click()
  await expect(page.locator('button[title*="クリックでログアウト"]')).toBeVisible({ timeout: 8000 })
  // editor はデフォルトプレイモード → 編集モードに切り替え
  await page.getByTitle('編集モード').click()

  // 提案ノードが表示される
  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(1, { timeout: 5000 })
  const normalCount = await page.locator('[data-node-id]').count()

  // 提案ノードをクリック → モーダルに承認ボタンが見える
  const proposalNode = page.locator('[data-node-id^="existing-proposal-"]').first()
  const box = await proposalNode.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

  // 承認ボタンがモーダルに表示される (スマホでも見える)
  await expect(page.getByText('✓ 承認')).toBeVisible({ timeout: 3000 })

  // 承認ボタンをタップ
  await page.getByText('✓ 承認').click()
  await expect(page.getByText('✓ 承認')).not.toBeVisible({ timeout: 3000 })

  // 提案ノードが通常ノードに変わる
  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(0, { timeout: 5000 })
  await expect(page.locator('[data-node-id]')).toHaveCount(normalCount, { timeout: 5000 })

  // 保存して確認
  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })
})

// ---------------------------------------------------------------------------
// W-H: スマホでの条件進捗・報酬受取 (M-A)
// ---------------------------------------------------------------------------

// M-A-1
test('スマホ: モーダルを開くとタスクタブに条件一覧が表示される (M-A-1)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // ノード1 をタップしてモーダルを開く
  const node1 = page.locator('[data-node-id="1"]')
  await expect(node1).toBeVisible({ timeout: 5000 })
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })

  // タスクタブをタップ（既に選択されているかもしれないので表示を確認するだけ）
  const taskTab = page.getByRole('tab', { name: /タスク|条件/ })
  if (await taskTab.count() > 0) await taskTab.click()

  // 条件行（🏆 または 📦）が少なくとも1件表示されていること
  await expect(page.getByText(/🏆|📦|✅/).first()).toBeVisible({ timeout: 3000 })

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// M-A-2
test('スマホ: progress_update受信後に達成済み条件にチェックマークが表示される (M-A-2)', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-editor-token')

  // モーダルを開く
  const node1 = page.locator('[data-node-id="1"]')
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })

  // 条件を達成済みにして progress_update を発火
  await setConditionProgress(
    page, EDITOR_UUID, 1,
    [{ conditionId: 'cond-1-adv', completed: true }],
    { completed: true },
  )
  await notifyProgressUpdate(page, 'demo-editor-token', 1, true)

  // モーダル内（ノードバッジ除く）にチェックマークが現れること
  await expect(page.locator(':not([data-node-id]) > [title="達成済み"]')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// M-A-3
test('スマホ: 完了済み未受取クエストで報酬受取ボタンが表示・タップできる (M-A-3)', async ({ page }) => {
  await resetProgress(page)
  await setProgress(page, EDITOR_UUID, 1, { completed: true, rewardClaimed: false })
  await loginAs(page, 'demo-editor-token')

  // モーダルを開く
  const node1 = page.locator('[data-node-id="1"]')
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })

  // 報酬受取ボタンが表示されてタップできること
  const claimBtn = page.getByText('★ 報酬を受け取る')
  await expect(claimBtn).toBeVisible({ timeout: 3000 })
  await claimBtn.click()

  // ボタンが消えること
  await expect(claimBtn).not.toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// M-A-4: 繰り返しcron入力欄に連続入力してもフォーカス（キーボード）が外れない
test('スマホ: cron入力欄に連続入力してもフォーカスが維持される (M-A-4)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // モーダルを開く
  const node1 = page.locator('[data-node-id="1"]')
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })

  // 繰り返し → 時刻指定 を選択 (縦スクロールで下にある)
  const scheduleBtn = page.getByRole('button', { name: '時刻指定' })
  await scheduleBtn.scrollIntoViewIfNeeded()
  await scheduleBtn.click()

  const cron = page.getByPlaceholder('分 時 日 月 曜日')
  await cron.click()
  await page.keyboard.press('Control+A')
  // 1文字ずつ入力してもフォーカスが外れない（以前は再マウントで毎回キーボードが閉じた）
  await page.keyboard.type('30 8 * * *', { delay: 40 })
  await expect(cron).toBeFocused()
  await expect(cron).toHaveValue('30 8 * * *')
})

// RK-7: スマホでもランキングが表示・スクロールできる
test('スマホ: ランキングが表示される (RK-7)', async ({ page }) => {
  await page.request.post(`${MOCK}/api/test/reset-completions`)
  // 他テストの汚染を避け quest 1 を非繰り返しに戻す (繰り返しだと見出しがセグメントになる)
  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-editor-token' } })
  await page.request.put(`${MOCK}/api/quests/1`, {
    headers: { Authorization: 'Bearer demo-editor-token' },
    data: { repeat: null },
  })
  await page.request.post(`${MOCK}/api/test/add-completion`, {
    data: {
      questId: 1,
      entries: [
        { playerUuid: 'm1', playerName: 'Notch', completedAt: '2026-06-19T09:00:00' },
        { playerUuid: 'm2', playerName: 'jeb_', completedAt: '2026-06-19T10:00:00' },
        { playerUuid: 'm3', playerName: 'Steve', completedAt: '2026-06-19T11:00:00' },
      ],
    },
  })
  await loginAs(page, 'demo-editor-token')

  // モーダルを開く
  const node1 = page.locator('[data-node-id="1"]')
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })

  // ランキング見出しとデータが描画される (縦スクロール1画面の最下部)
  const ranking = page.getByText('🏆 クリア順ランキング')
  await expect(ranking).toBeAttached({ timeout: 5000 })
  await ranking.scrollIntoViewIfNeeded()
  await expect(ranking).toBeVisible()
  await expect(page.getByText('Notch')).toBeVisible()
})

// VA-MOB-1: スマホで view-as パネルが下部ドロワーとして表示・折りたたみできる
test('スマホ: view-as パネルが下部に展開・タブで折りたたみできる (VA-MOB-1)', async ({ page }) => {
  const OTHER_UUID = 'dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb'
  const OTHER_NAME = 'Notch'

  // Notch をランキングに載せる
  await page.request.post(`${MOCK}/api/test/reset-completions`)
  await page.request.post(`${MOCK}/api/test/add-completion`, {
    data: {
      questId: 1,
      entries: [{ playerUuid: OTHER_UUID, playerName: OTHER_NAME, completedAt: '2026-06-19T09:00:00' }],
    },
  })

  // view-as 直リンクでアクセス
  await loginAs(page, 'demo-player-token')
  await page.goto(`/?viewAs=${OTHER_UUID}&viewAsName=${OTHER_NAME}`)
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })

  const panel = page.getByTestId('viewas-panel')
  await expect(panel).toBeVisible()

  // パネルが下部にある (bottom:0) かつ高さを持つ
  const box = await panel.boundingBox()
  expect(box).not.toBeNull()
  // スマホ画面高さ (667) に対して下端が画面内に収まっている
  expect(box!.y + box!.height).toBeLessThanOrEqual(700)
  // 展開時は高さがある (折りたたみ時はタブだけ)
  expect(box!.height).toBeGreaterThan(60)

  // アクティビティタブをクリックすると折りたたまれる (同タブ再クリック = トグル)
  await panel.getByRole('button', { name: 'アクティビティ' }).click()
  const collapsedBox = await panel.boundingBox()
  expect(collapsedBox!.height).toBeLessThan(box!.height)

  // 獲得報酬タブをクリックすると再展開
  await panel.getByRole('button', { name: '獲得報酬' }).click()
  const expandedBox = await panel.boundingBox()
  expect(expandedBox!.height).toBeGreaterThan(collapsedBox!.height)
})

// ---------------------------------------------------------------------------
// M-R: ロングタップ報酬ポップオーバー
// ---------------------------------------------------------------------------

/** Touch イベントで長押しをシミュレート (500ms 以上保持) */
async function simulateLongPress(page: import('@playwright/test').Page, selector: string) {
  const el = page.locator(selector)
  const box = await el.boundingBox()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2

  await page.evaluate(({ sel, x, y }) => {
    const target = document.querySelector(sel) as Element
    const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y })
    target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch], changedTouches: [touch] }))
  }, { sel: selector, x, y })

  await page.waitForTimeout(600)

  await page.evaluate(({ sel, x, y }) => {
    const target = document.querySelector(sel) as Element
    const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y })
    target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [touch] }))
  }, { sel: selector, x, y })
}

// M-R-1. ロングタップで報酬ポップオーバーが表示される
test('スマホ: ロングタップで報酬ポップオーバーが表示される (M-R-1)', async ({ page }) => {
  const node = page.locator('[data-node-id="1"]')
  await expect(node).toBeVisible({ timeout: 5000 })

  await simulateLongPress(page, '[data-node-id="1"]')

  const popover = page.locator('[data-testid="longtap-reward-popover"]')
  await expect(popover).toBeVisible({ timeout: 2000 })

  // ノードタイトルが表示される
  await expect(popover.getByText('基本')).toBeVisible()
})

// M-R-2. ロングタップ後にモーダルが開かない (タップと競合しない)
test('スマホ: ロングタップ後にクエストモーダルが開かない (M-R-2)', async ({ page }) => {
  await expect(page.locator('[data-node-id="1"]')).toBeVisible({ timeout: 5000 })

  await simulateLongPress(page, '[data-node-id="1"]')

  // モーダルが開かない
  await expect(page.getByPlaceholder('クエストのタイトル')).not.toBeVisible()

  // ポップオーバーは表示されている
  await expect(page.locator('[data-testid="longtap-reward-popover"]')).toBeVisible({ timeout: 2000 })
})

// M-R-3. オーバーレイをタップするとポップオーバーが閉じる
test('スマホ: ポップオーバーのオーバーレイをタップすると閉じる (M-R-3)', async ({ page }) => {
  await expect(page.locator('[data-node-id="1"]')).toBeVisible({ timeout: 5000 })

  await simulateLongPress(page, '[data-node-id="1"]')
  await expect(page.locator('[data-testid="longtap-reward-popover"]')).toBeVisible({ timeout: 2000 })

  // ポップオーバーの外 (右下) をクリックして閉じる
  await page.mouse.click(370, 600)
  await expect(page.locator('[data-testid="longtap-reward-popover"]')).not.toBeVisible()
})
