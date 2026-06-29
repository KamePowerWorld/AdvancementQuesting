/**
 * クエストノードの報酬ポップオーバーテスト
 *
 * R-1: PCホバーで報酬チップが表示される
 * R-2: PCホバーで報酬のないノードには報酬セクションが表示されない
 * R-3: ホバーを外すと報酬チップが消える
 */

import { test, expect } from '@playwright/test'
import { resetAll } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// R-1. ホバーで報酬ありノードの報酬チップが表示される (quest 1 "基本" = wooden_pickaxe)
test('PCホバー: 報酬ありノードで報酬チップが表示される', async ({ page }) => {
  const node = page.locator('[data-node-id="1"]')
  await expect(node).toBeVisible({ timeout: 5000 })

  await node.hover()

  // 報酬セクションが表示される
  const chips = page.locator('[data-testid="hover-reward-chips"]')
  await expect(chips).toBeVisible({ timeout: 3000 })

  // 報酬チップが1つ以上ある
  const chipCount = await chips.locator('> *').count()
  expect(chipCount).toBeGreaterThanOrEqual(1)
})

// R-2. 報酬ゼロのノードでは報酬セクションが出ない (quest 5 "チェックテスト" = rewards:[])
test('PCホバー: 報酬なしノードでは報酬チップが表示されない', async ({ page }) => {
  const node = page.locator('[data-node-id="5"]')
  await expect(node).toBeVisible({ timeout: 5000 })

  await node.hover()

  // ツールチップは出るが報酬チップはない
  await expect(page.locator('[data-testid="hover-reward-chips"]')).not.toBeVisible()
})

// R-3. ホバーを外すと報酬チップが消える
test('PCホバー: ホバーを外すと報酬チップが消える', async ({ page }) => {
  const node = page.locator('[data-node-id="1"]')
  await expect(node).toBeVisible({ timeout: 5000 })

  await node.hover()
  await expect(page.locator('[data-testid="hover-reward-chips"]')).toBeVisible({ timeout: 3000 })

  // キャンバスの端にマウスを移動してホバーを外す
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const canvasBox = await canvas.boundingBox()
  await page.mouse.move(canvasBox!.x + 5, canvasBox!.y + 5)

  await expect(page.locator('[data-testid="hover-reward-chips"]')).not.toBeVisible()
})
