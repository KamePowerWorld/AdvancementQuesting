/**
 * 認証関連テスト
 *  1. 未ログイン状態の表示
 *  2. ログインモーダルの開閉
 *  3. 編集者ログイン → 保存ボタン表示 / ノードクリックでモーダル
 *  4. ログアウト
 *  5. プレイヤーログイン → 提案ボタン表示
 * 12. コードログイン
 * 15. ログアウト→再ログインの繰り返し
 * W-C. 読み取り専用モーダル（未ログイン/プレイヤーにはタスク追加・削除ボタン非表示）
 * W-G. ?code=XXXXXX 付きURLで自動ログイン
 */

import { test, expect } from '@playwright/test'
import { loginAs, loggedInBtn, loggedOutBtn, openQuestModal, MOCK, resetAll } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// 1
test('未ログイン: ログインボタン表示・提案ボタン非表示・保存ボタン非表示', async ({ page }) => {
  await expect(loggedOutBtn(page)).toBeVisible()
  await expect(loggedInBtn(page)).not.toBeVisible()
  await expect(page.getByText('💾 保存')).not.toBeVisible()
  await expect(page.getByText('クエスト追加を提案する')).not.toBeVisible()
})

// 2
test('ログインモーダル: 左バー下部アイコンをクリックで開閉', async ({ page }) => {
  await page.locator('button[title="ログイン"]').click()
  await expect(page.getByText('ログイン').first()).toBeVisible()
  await expect(page.getByText('編集者としてログイン')).toBeVisible()
  await expect(page.getByText('プレイヤーとしてログイン')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByText('編集者としてログイン')).not.toBeVisible()
})

// 3
test('編集者ログイン: 保存ボタン表示・ノードクリックでモーダル', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  await expect(page.getByText('💾 保存')).toBeVisible()
  await expect(page.getByText('クエスト追加を提案する')).toBeVisible()
  await expect(page.getByTitle('移動')).toBeVisible()
  await expect(page.getByTitle('クエストを追加')).toBeVisible()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const box = await canvas.boundingBox()
  await page.mouse.click(box!.x + 100, box!.y + 100)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveValue('基本')

  await page.getByRole('button', { name: '閉じる' }).last().click()
  await expect(page.getByPlaceholder('クエストのタイトル')).not.toBeVisible()
})

// 4
test('ログアウト: ロールバッジが消える', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await loggedInBtn(page).click()
  await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })
})

// 5
test('プレイヤーログイン: 提案ボタン表示・保存ボタン非表示・ツールバーは矢印のみ', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await expect(page.getByText('💾 保存')).not.toBeVisible()
  await expect(page.getByText('クエスト追加を提案する')).toBeVisible()
  await expect(page.getByTitle('移動')).not.toBeVisible()
  await expect(page.getByTitle('クエストを追加')).not.toBeVisible()
})

// 12
test('コードログイン: ログインモーダルからコード入力でログイン', async ({ page }) => {
  await page.request.post(`${MOCK}/api/test/restore-auth-code`)

  await page.locator('button[title="ログイン"]').click()
  await expect(page.getByPlaceholder('123456')).toBeVisible({ timeout: 3000 })
  await page.getByPlaceholder('123456').fill('123456')
  await page.locator('button').filter({ hasText: /^ログイン$/ }).click()

  await expect(page.getByPlaceholder('123456')).not.toBeVisible({ timeout: 5000 })
  await page.reload()
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
})

// W-C
test('未ログイン: モーダルにタスク追加ボタン・削除ボタンが表示されない (W-C-1)', async ({ page }) => {
  // 未ログインでノードを開く (test 13 と同じ前提: readOnly=true)
  await openQuestModal(page, '1')

  // タスク追加ボタン (hover:bg-white/10) が非表示であること
  await expect(page.locator('button.hover\\:bg-white\\/10').first()).not.toBeVisible()
  // 削除ボタン (条件・報酬行の✕) が非表示であること
  await expect(page.locator('[title="削除"]').first()).not.toBeVisible()

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

test('プレイヤー: 既存クエストのモーダルでタスク追加・削除ボタンが表示されない (W-C-2)', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await openQuestModal(page, '1')

  // プレイヤーも既存クエストは読み取り専用
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveAttribute('readonly', '')
  await expect(page.locator('button.hover\\:bg-white\\/10').first()).not.toBeVisible()

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// W-G
test('URLログイン: ?code=XXXXXX 付きアクセスで自動ログインされる (W-G-1)', async ({ page }) => {
  // beforeEach の goto('/') より前にコードを準備してから直接 /?code= へアクセス
  await page.request.post(`${MOCK}/api/test/restore-auth-code`)
  await page.goto('/?code=123456')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })

  // ログイン済みになっていること
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
})

test('URLログイン: ログイン後にURLのcodeパラメータが除去される (W-G-2)', async ({ page }) => {
  await page.request.post(`${MOCK}/api/test/restore-auth-code`)
  await page.goto('/?code=123456')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })

  // URL から ?code= が消えていること
  await expect.poll(() => new URL(page.url()).search, { timeout: 3000 }).toBe('')
})

// 15
test('ログアウト→再ログインを繰り返しても正常にロールが表示される', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await page.locator('button[title="ログイン"]').click()
    await expect(page.getByPlaceholder('123456')).toBeVisible({ timeout: 3000 })
    await page.getByText('✏️ 編集者としてログイン').click()
    await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
    // editor ログイン直後はプレイモード (デフォルト) → 保存ボタン非表示
    await expect(page.getByText('💾 保存')).not.toBeVisible()
    // 編集モードに切り替えると保存ボタンが現れる
    await page.getByTitle('編集モード').click()
    await expect(page.getByText('💾 保存')).toBeVisible()

    await loggedInBtn(page).click()
    await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText('💾 保存')).not.toBeVisible()
  }

  await page.locator('button[title="ログイン"]').click()
  await expect(page.getByPlaceholder('123456')).toBeVisible({ timeout: 3000 })
  await page.getByText('🎮 プレイヤーとしてログイン').click()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('クエスト追加を提案する')).toBeVisible()
})
