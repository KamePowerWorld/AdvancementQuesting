/**
 * 統計タスクエディタ E2E テスト
 *
 * SE-1: エディタで統計タスクを追加・保存できる
 * SE-2: カスタム統計を選択すると正しい "minecraft:" プレフィックス付きの statId が保存される
 * SE-3: アイテムベース統計を選択すると正しい "minecraft:" プレフィックス付きの statId が保存される
 *
 * 実際のUIフロー:
 *  ノードクリック → QuestEditorModal → タスク[+]メニュー → 統計(📊)選択
 *  → TaskRewardEditorModal → StatField で StatSelectorModal を開く
 *  → カテゴリ→対象を選択 → 完了 → 保存
 */

import { test, expect } from '@playwright/test'
import { loginAs, resetAll, MOCK } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

/** ノード1をクリックして QuestEditorModal を開く */
async function openFirstQuestEditor(page: import('@playwright/test').Page) {
  const node = page.locator('[data-node-id="1"]')
  await expect(node).toBeVisible({ timeout: 5000 })
  const box = await node.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 5000 })
}

/** タスク[+]メニューから統計タスクを追加し、TaskRewardEditorModal を開く */
async function addStatTask(page: import('@playwright/test').Page) {
  // タスクセクションの [+] ボタン
  await page.locator('button.hover\\:bg-white\\/10').first().click()
  // メニューから 📊 統計 を選択 (addTask が TaskRewardEditorModal を開く)
  await page.locator('.px-3.py-2').filter({ hasText: '📊' }).first().click()
  // StatField の「クリックして選択...」から StatSelectorModal を開く
  await expect(page.getByText('クリックして選択...')).toBeVisible({ timeout: 3000 })
  await page.getByText('クリックして選択...').click()
  await expect(page.getByText('統計カテゴリを選択')).toBeVisible({ timeout: 3000 })
}

/** 統計を選択して保存し、クエスト1の最新データを返す */
async function selectAndSave(
  page: import('@playwright/test').Page,
  category: string,
  target: { search: string; click: () => Promise<void> },
) {
  // カテゴリを選択
  await page.getByText(category, { exact: true }).click()
  await expect(page.getByPlaceholder('検索...')).toBeVisible({ timeout: 3000 })

  // 対象を検索して選択
  await page.getByPlaceholder('検索...').fill(target.search)
  await target.click()

  // StatSelectorModal が閉じ、StatField に反映されたことを確認
  await expect(page.getByText('統計カテゴリを選択')).not.toBeVisible({ timeout: 3000 })

  // TaskRewardEditor を閉じる
  await page.getByRole('button', { name: '完了' }).click()

  // QuestEditorModal を閉じて保存
  await page.getByRole('button', { name: '閉じる' }).last().click()
  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  const response = await page.request.get(`${MOCK}/api/quests/1`)
  return (await response.json()) as { conditions: Array<Record<string, unknown>> }
}

// SE-1: エディタで統計タスクを追加・保存できる (採取した回数: 石)
test('SE-1: 統計タスクを追加・保存できる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openFirstQuestEditor(page)
  await addStatTask(page)

  const quest = await selectAndSave(page, '採取した回数', {
    search: 'stone',
    click: () => page.locator('[title$="(minecraft:stone)"]').first().click(),
  })

  // StatSelectorModal 側で NamespacedId 化された statType / statId が保存されている
  const stat = quest.conditions.find((c) => c.type === 'stat')
  expect(stat).toBeDefined()
  expect(stat!.statType).toBe('minecraft:mined')
  expect(stat!.statId).toBe('minecraft:stone')
})

// SE-2: カスタム統計を選択すると正しい "minecraft:" プレフィックス付きの statId が保存される
test('SE-2: カスタム統計の statId に "minecraft:" プレフィックスが付く', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openFirstQuestEditor(page)
  await addStatTask(page)

  const quest = await selectAndSave(page, 'カスタム', {
    search: 'jump',
    click: () => page.getByText('minecraft:jump', { exact: true }).click(),
  })

  const stat = quest.conditions.find((c) => c.type === 'stat')
  expect(stat).toBeDefined()
  expect(stat!.statType).toBe('minecraft:custom')
  expect(stat!.statId).toBe('minecraft:jump')
  expect(stat!.statId).not.toBe('jump') // プレフィックスなしはNG
})

// SE-3: アイテムベース統計でも "minecraft:" プレフィックスが付く
test('SE-3: アイテムベース統計の statId に "minecraft:" プレフィックスが付く', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openFirstQuestEditor(page)
  await addStatTask(page)

  const quest = await selectAndSave(page, '使用した回数', {
    search: 'diamond',
    click: () => page.locator('[title$="(minecraft:diamond)"]').first().click(),
  })

  const stat = quest.conditions.find((c) => c.type === 'stat')
  expect(stat).toBeDefined()
  expect(stat!.statType).toBe('minecraft:used')
  expect(stat!.statId).toBe('minecraft:diamond')
  expect(stat!.statId).not.toBe('diamond') // プレフィックスなしはNG
})
