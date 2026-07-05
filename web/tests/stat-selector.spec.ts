/**
 * 統計タスクエディタ E2E テスト
 *
 * SE-1: エディタで統計タスクを追加・保存できる
 * SE-2: カスタム統計を選択すると正しい "minecraft:" プレフィックス付きの statId が保存される
 * SE-3: アイテムベース統計を選択すると正しい "minecraft:" プレフィックス付きの statId が保存される
 */

import { test, expect } from '@playwright/test'
import { loginAs, resetAll, MOCK, getFirstQuestId } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// SE-1: エディタで統計タスクを追加・保存できる
test('SE-1: 統計タスクを追加・保存できる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // 新規クエスト作成
  await page.getByRole('button', { name: '新規クエスト作成' }).click()
  await expect(page.getByPlaceholder('クエストタイトル')).toBeVisible({ timeout: 5000 })

  // タイトル入力
  const title = '統計テスト'
  await page.getByPlaceholder('クエストタイトル').fill(title)
  await page.getByRole('button', { name: '保存して公開' }).click()
  await expect(page.getByText(title)).toBeVisible({ timeout: 3000 })

  // タスク追加ボタンをクリック
  const questCard = page.locator('.quest-card').filter({ hasText: title })
  await questCard.getByRole('button', { name: 'タスク追加' }).click()

  // 統計タスクを選択
  await expect(page.getByText('統計')).toBeVisible({ timeout: 3000 })
  await page.getByText('統計').click()

  // 統計セレクターモーダルが開く
  await expect(page.getByText('統計カテゴリを選択')).toBeVisible({ timeout: 3000 })

  // 「採掘」カテゴリを選択
  await page.getByText('採掘').click()
  await expect(page.getByPlaceholder('検索...')).toBeVisible({ timeout: 3000 })

  // 「石」を検索して選択
  await page.getByPlaceholder('検索...').fill('stone')
  await page.locator('title=Stone (stone)').or(page.locator('[title="stone"]')).first().click()

  // モーダルが閉じ、統計タスクが表示される
  await expect(page.getByText('統計カテゴリを選択')).not.toBeVisible({ timeout: 3000 })
  await expect(page.getByText('採掘: 石')).toBeVisible({ timeout: 3000 })

  // 保存して公開
  await page.getByRole('button', { name: '保存して公開' }).click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })
})

// SE-2: カスタム統計を選択すると正しい "minecraft:" プレフィックス付きの statId が保存される
test('SE-2: カスタム統計の statId に "minecraft:" プレフィックスが付く', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // 新規クエスト作成
  await page.getByRole('button', { name: '新規クエスト作成' }).click()
  await expect(page.getByPlaceholder('クエストタイトル')).toBeVisible({ timeout: 5000 })

  const title = 'カスタム統計テスト'
  await page.getByPlaceholder('クエストタイトル').fill(title)
  await page.getByRole('button', { name: '保存して公開' }).click()
  await expect(page.getByText(title)).toBeVisible({ timeout: 3000 })

  // タスク追加 -> 統計
  const questCard = page.locator('.quest-card').filter({ hasText: title })
  await questCard.getByRole('button', { name: 'タスク追加' }).click()
  await page.getByText('統計').click()

  // 「カスタム」カテゴリを選択
  await expect(page.getByText('統計カテゴリを選択')).toBeVisible({ timeout: 3000 })
  await page.getByText('カスタム').or(page.getByText('📊')).click()
  await expect(page.getByPlaceholder('検索...')).toBeVisible({ timeout: 3000 })

  // 「ジャンプ」を検索して選択
  await page.getByPlaceholder('検索...').fill('jump')
  await page.locator('text=/jump.*ジャンプ/').or(page.locator('[title="jump"]')).first().click()

  // モーダルが閉じ、統計タスクが表示される（「カスタム: ジャンプ」と表示されるはず）
  await expect(page.getByText('統計カテゴリを選択')).not.toBeVisible({ timeout: 3000 })
  await expect(page.getByText(/カスタム.*ジャンプ/)).toBeVisible({ timeout: 3000 })

  // 保存して公開
  await page.getByRole('button', { name: '保存して公開' }).click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  // API から保存されたクエストデータを取得して statId を確認
  const questId = await getFirstQuestId(page, title)
  const response = await page.request.get(`/api/quests/${questId}`, {
    headers: { Authorization: `Bearer demo-editor-token` },
  })
  const quest = await response.json()

  // カスタム統計の statId は "minecraft:jump" であるべき（"jump" ではない）
  const statCondition = quest.conditions.find((c: any) => c.type === 'stat')
  expect(statCondition).toBeDefined()
  expect(statCondition.statType).toBe('minecraft:custom')
  expect(statCondition.statId).toBe('minecraft:jump')
  expect(statCondition.statId).not.toBe('jump') // プレフィックスなしはNG
})

// SE-3: アイテムベース統計でも "minecraft:" プレフィックスが付く
test('SE-3: アイテムベース統計の statId に "minecraft:" プレフィックスが付く', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // 新規クエスト作成
  await page.getByRole('button', { name: '新規クエスト作成' }).click()
  await expect(page.getByPlaceholder('クエストタイトル')).toBeVisible({ timeout: 5000 })

  const title = 'アイテム統計テスト'
  await page.getByPlaceholder('クエストタイトル').fill(title)
  await page.getByRole('button', { name: '保存して公開' }).click()
  await expect(page.getByText(title)).toBeVisible({ timeout: 3000 })

  // タスク追加 -> 統計
  const questCard = page.locator('.quest-card').filter({ hasText: title })
  await questCard.getByRole('button', { name: 'タスク追加' }).click()
  await page.getByText('統計').click()

  // 「使用」カテゴリを選択
  await expect(page.getByText('統計カテゴリを選択')).toBeVisible({ timeout: 3000 })
  await page.getByText('使用').click()
  await expect(page.getByPlaceholder('検索...')).toBeVisible({ timeout: 3000 })

  // 「ダイアモンド」を検索して選択
  await page.getByPlaceholder('検索...').fill('diamond')
  await page.locator('title=Diamond (diamond)').or(page.locator('[title="diamond"]')).first().click()

  // モーダルが閉じ、統計タスクが表示される
  await expect(page.getByText('統計カテゴリを選択')).not.toBeVisible({ timeout: 3000 })
  await expect(page.getByText(/使用.*ダイヤモンド/)).toBeVisible({ timeout: 3000 })

  // 保存して公開
  await page.getByRole('button', { name: '保存して公開' }).click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  // API から保存されたクエストデータを取得して statId を確認
  const questId = await getFirstQuestId(page, title)
  const response = await page.request.get(`/api/quests/${questId}`, {
    headers: { Authorization: `Bearer demo-editor-token` },
  })
  const quest = await response.json()

  // アイテム統計の statId は "minecraft:diamond" であるべき（"diamond" ではない）
  const statCondition = quest.conditions.find((c: any) => c.type === 'stat')
  expect(statCondition).toBeDefined()
  expect(statCondition.statType).toBe('minecraft:used')
  expect(statCondition.statId).toBe('minecraft:diamond')
  expect(statCondition.statId).not.toBe('diamond') // プレフィックスなしはNG
})
