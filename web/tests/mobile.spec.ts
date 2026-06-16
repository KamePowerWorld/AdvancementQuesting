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
  EDITOR_UUID, MOCK,
} from './helpers.js'

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

async function loginAs(page: Page, token: 'demo-editor-token' | 'demo-player-token') {
  await page.request.post('http://localhost:3001/api/auth/quick', { data: { token } })
  await page.evaluate((t) => localStorage.setItem('token', t), token)
  await page.reload()
  await expect(page.locator('button[title*="クリックでログアウト"]')).toBeVisible({ timeout: 8000 })
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

  // 編集モード: 保存・選択・追加ツールがある
  await expect(page.getByText('💾 保存')).toBeVisible()
  await expect(page.getByTitle('選択')).toBeVisible()
  await expect(page.getByTitle('クエストを追加')).toBeVisible()

  // プレイモードへ切り替え
  await page.locator('nav button[title="プレイモード"]').click()
  await expect(page.getByText('💾 保存')).not.toBeVisible()
  await expect(page.getByTitle('選択')).toBeVisible()
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
  await page.request.post('http://localhost:3001/api/test/reset-proposals')

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
  await page.request.post('http://localhost:3001/api/test/reset-proposals')

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

test('スマホ: editor がタブを追加・並び替え・削除できる (M-TAB-1)', async ({ page }) => {
  await page.request.post(`${MOCK}/api/test/reset-proposals`)
  await loginAs(page, 'demo-editor-token')

  page.once('dialog', (dialog) => dialog.accept('探索'))
  await page.getByTitle('タブを追加').click()
  await expect(page.getByRole('button', { name: '探索' })).toBeVisible({ timeout: 3000 })

  await page.getByRole('button', { name: 'すべて' }).click()
  const node1 = page.locator('[data-node-id="1"]')
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await page.getByRole('button', { name: '詳細' }).click()
  await page.locator('select').first().selectOption('探索')
  await page.getByRole('button', { name: '閉じる' }).last().click()

  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  const quest = await (await page.request.get(`${MOCK}/api/quests/1`)).json()
  expect(quest.category).toBe('探索')

  await page.getByRole('button', { name: '探索' }).click()
  await expect(page.locator('[data-node-id="1"]')).toBeVisible()
  await expect(page.locator('[data-node-id="2"]')).toHaveCount(0)

  await page.getByTitle('左へ移動').click()
  const tabs = await (await page.request.get(`${MOCK}/api/tabs`)).json()
  expect(tabs.map((tab: { name: string }) => tab.name)).toEqual(['序盤', '探索', '中盤'])

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTitle('タブを削除').click()
  await expect(page.getByRole('button', { name: '探索' })).toHaveCount(0)

  const questAfterDelete = await (await page.request.get(`${MOCK}/api/quests/1`)).json()
  expect(questAfterDelete.category).toBeNull()
})
