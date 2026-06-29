/**
 * クエスト作成補助AI (AIアシストパネル) の E2E テスト
 *
 * AI-1. 編集者: ✨AIボタンでパネルを開き「生成する」で3択カードが出る
 * AI-2. リロール: 「別の案を生成」でカード内容が変わる
 * AI-3. チャット: ヒントを送ると候補が再提案される
 * AI-4. 採用: 「この案を使う」でタイトル・説明がセット反映されパネルが閉じる
 * AI-M. スマホ: ✨ボタンで全画面オーバーレイが開き、×で閉じる
 */

import { test, expect } from '@playwright/test'
import { loginAs, openQuestModal, resetAll } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// AI-1
test('AIアシスト: 生成すると3択カードが表示される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await page.getByTestId('ai-toggle-btn').click()
  await expect(page.getByTestId('ai-generate-btn')).toBeVisible({ timeout: 3000 })

  await page.getByTestId('ai-generate-btn').click()
  await expect(page.getByTestId('ai-card')).toHaveCount(3, { timeout: 5000 })
})

// AI-2
test('AIアシスト: 別の案を生成するとカード内容が変わる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await page.getByTestId('ai-toggle-btn').click()
  await page.getByTestId('ai-generate-btn').click()
  await expect(page.getByTestId('ai-card')).toHaveCount(3, { timeout: 5000 })

  const firstTitle = await page.getByTestId('ai-card-title').first().textContent()

  await page.getByTestId('ai-reroll-btn').click()
  await expect.poll(
    async () => page.getByTestId('ai-card-title').first().textContent(),
    { timeout: 5000 },
  ).not.toBe(firstTitle)
})

// AI-3
test('AIアシスト: チャットでヒントを送ると候補が再提案される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await page.getByTestId('ai-toggle-btn').click()
  await page.getByTestId('ai-generate-btn').click()
  await expect(page.getByTestId('ai-card')).toHaveCount(3, { timeout: 5000 })

  const before = await page.getByTestId('ai-card-title').first().textContent()

  await page.getByTestId('ai-chat-input').fill('ほのぼの農業系で')
  await page.getByTestId('ai-chat-send').click()

  await expect.poll(
    async () => page.getByTestId('ai-card-title').first().textContent(),
    { timeout: 5000 },
  ).not.toBe(before)
})

// AI-4
test('AIアシスト: この案を使うとタイトル・説明がセット反映されパネルが閉じる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await page.getByTestId('ai-toggle-btn').click()
  await page.getByTestId('ai-generate-btn').click()
  await expect(page.getByTestId('ai-card')).toHaveCount(3, { timeout: 5000 })

  const card = page.getByTestId('ai-card').first()
  const adoptTitle = (await card.getByTestId('ai-card-title').textContent())!.trim()
  const adoptDesc = (await card.getByTestId('ai-card-desc').textContent())!.trim()

  await card.getByTestId('ai-card-adopt').click()

  // パネルが閉じる
  await expect(page.getByTestId('ai-card')).toHaveCount(0)
  // タイトルと説明がセット反映される
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveValue(adoptTitle)
  await expect(page.getByPlaceholder(/クエストの詳細な説明/)).toHaveValue(adoptDesc)
})

// AI-5
test('AIアシスト: 既にタイトルが入力済みだと修正案（【改】）になる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  // タイトルを入力してから生成
  await page.getByPlaceholder('クエストのタイトル').fill('テスト用クエスト名')

  await page.getByTestId('ai-toggle-btn').click()
  await page.getByTestId('ai-generate-btn').click()
  await expect(page.getByTestId('ai-card')).toHaveCount(3, { timeout: 5000 })

  await expect(page.getByTestId('ai-card-title').first()).toContainText('【改】')
})

// AI-6
test('AIアシスト: 歯車からプロンプトを編集・保存できる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await page.getByTestId('ai-toggle-btn').click()
  await page.getByTestId('ai-prompt-btn').click()

  // プロンプト編集欄が表示され、現在のプロンプトが読み込まれる
  await expect(page.getByTestId('ai-prompt-input')).toBeVisible({ timeout: 3000 })
  await expect(page.getByTestId('ai-prompt-input')).not.toHaveValue('')

  await page.getByTestId('ai-prompt-input').fill('カスタムプロンプト・テスト')
  await page.getByTestId('ai-prompt-save').click()

  // 提案ビューに戻る
  await expect(page.getByTestId('ai-generate-btn')).toBeVisible({ timeout: 3000 })

  // 再度開くと保存内容が反映されている
  await page.getByTestId('ai-prompt-btn').click()
  await expect(page.getByTestId('ai-prompt-input')).toHaveValue('カスタムプロンプト・テスト')
})

// AI-M (スマホ)
test.describe('スマホ', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('AIアシスト: ✨で全画面オーバーレイが開き、×で閉じる', async ({ page }) => {
    await loginAs(page, 'demo-editor-token')
    await openQuestModal(page, '1')

    await page.getByTestId('ai-toggle-btn').click()
    await page.getByTestId('ai-generate-btn').click()
    await expect(page.getByTestId('ai-card')).toHaveCount(3, { timeout: 5000 })

    await page.getByRole('button', { name: 'AIパネルを閉じる' }).click()
    await expect(page.getByTestId('ai-card')).toHaveCount(0)
    // モーダル自体は開いたまま
    await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible()
  })
})
