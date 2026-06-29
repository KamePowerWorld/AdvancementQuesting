/**
 * URLハッシュ関連テスト
 * 26. ノードを開くと #quest-<id> が付き、閉じると消える
 * 27. #quest-<id> 付きアクセスでモーダルが自動オープン
 * 28. 戻る/進むでモーダルが開閉する
 */

import { test, expect } from '@playwright/test'
import { resetAll } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// 26
test('URLハッシュ: クエストを開くと #quest-<id> が付き閉じると消える (26)', async ({ page }) => {
  const node1 = page.locator('[data-node-id="1"]')
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect.poll(() => new URL(page.url()).hash, { timeout: 3000 }).toBe('#quest-1')

  await page.getByRole('button', { name: '閉じる' }).last().click()
  await expect(page.getByPlaceholder('クエストのタイトル')).not.toBeVisible()
  await expect.poll(() => new URL(page.url()).hash, { timeout: 3000 }).toBe('')
})

// 27
test('URLハッシュ: #quest-<id> 付きアクセスでモーダルが自動オープン (27)', async ({ page }) => {
  await page.goto('/#quest-3')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 5000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveValue('ダイヤの輝き')
  await expect.poll(() => new URL(page.url()).hash, { timeout: 2000 }).toBe('#quest-3')
})

// 28
test('URLハッシュ: 戻る/進むでモーダルが開閉する (28)', async ({ page }) => {
  const node1 = page.locator('[data-node-id="1"]')
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })

  await page.evaluate(() => { window.location.hash = '' })
  await expect(page.getByPlaceholder('クエストのタイトル')).not.toBeVisible({ timeout: 3000 })

  await page.evaluate(() => { window.location.hash = '#quest-2' })
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveValue('石器時代')
})
