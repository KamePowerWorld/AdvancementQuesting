/**
 * スマホサイズ (375×667 / iPhone SE) での E2E テスト
 *
 * ナビバーが狭い環境でボタンが正しく表示・操作できるかを検証する。
 */

import { test, expect, type Page } from '@playwright/test'

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
