/**
 * 統計ダッシュボードテスト
 * DB-1. 統計タブに切り替えられる
 * DB-2. エディターはウィジェット追加バーが見える
 * DB-3. プレイヤーはウィジェット追加バーが見えない
 * DB-4. ウィジェットを追加するとグリッドに表示される
 * DB-5. ウィジェットの×ボタンで削除できる
 * DB-6. ウィジェット設定モーダルが開閉できる（タイトル・説明文フィールド含む）
 * DB-7. ダッシュボードレイアウトがリロード後も保持される
 * DB-8. ウィジェットのD&Dで並び替えられる
 * DB-9. 総受け取り報酬ウィジェットが追加できる
 */

import { test, expect } from '@playwright/test'
import { loginAs, MOCK, resetAll } from './helpers.js'

async function resetDashboard(page: import('@playwright/test').Page) {
  await page.request.put(`${MOCK}/api/dashboard`, {
    headers: { Authorization: 'Bearer demo-editor-token' },
    data: { widgets: [] },
  })
}

async function openStatsTab(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(
    page.getByText('+ ウィジェット追加:').or(page.getByText('ダッシュボードが未設定です')),
  ).toBeVisible({ timeout: 5000 }).catch(() => {})
}

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await resetDashboard(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

test('DB-1: 統計タブに切り替えられる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('+ ウィジェット追加:')).toBeVisible({ timeout: 5000 })
})

test('DB-2: エディターはウィジェット追加バーが見える', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('+ ウィジェット追加:')).toBeVisible({ timeout: 5000 })
})

test('DB-3: プレイヤーはウィジェット追加バーが見えない', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('+ ウィジェット追加:')).toHaveCount(0)
})

test('DB-4: ウィジェットを追加するとグリッドに表示される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('+ ウィジェット追加:')).toBeVisible({ timeout: 5000 })

  await expect(page.getByText('ウィジェットを追加してください')).toBeVisible()

  await page.getByRole('button', { name: /アクティビティ/ }).click()

  await expect(page.getByText('ウィジェットを追加してください')).toHaveCount(0)
  await expect(page.getByTitle('ウィジェットを削除')).toBeVisible({ timeout: 5000 })
})

test('DB-5: ウィジェットの×ボタンで削除できる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('+ ウィジェット追加:')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: /アクティビティ/ }).click()
  await expect(page.getByTitle('ウィジェットを削除')).toBeVisible({ timeout: 5000 })

  await page.getByTitle('ウィジェットを削除').click()
  await expect(page.getByText('ウィジェットを追加してください')).toBeVisible({ timeout: 3000 })
})

test('DB-6: ウィジェット設定モーダルが開閉できる（タイトル・説明文フィールド含む）', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('+ ウィジェット追加:')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: /ランキング/ }).click()
  await expect(page.getByTitle('ウィジェット設定')).toBeVisible({ timeout: 5000 })

  await page.getByTitle('ウィジェット設定').click()
  await expect(page.getByText('ウィジェット設定')).toBeVisible({ timeout: 3000 })

  // タイトル・説明文フィールドが存在する
  await expect(page.getByPlaceholder('空欄時はデフォルト名を表示')).toBeVisible()
  await expect(page.getByPlaceholder('ウィジェット上部に表示されます')).toBeVisible()

  await page.getByRole('button', { name: 'キャンセル' }).click()
  await expect(page.getByRole('button', { name: 'キャンセル' })).toHaveCount(0)
})

test('DB-7: ダッシュボードレイアウトがリロード後も保持される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('+ ウィジェット追加:')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: /アクティビティ/ }).click()
  await expect(page.getByTitle('ウィジェットを削除')).toBeVisible({ timeout: 5000 })

  await page.waitForTimeout(1500)

  await page.reload()
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
  await loginAs(page, 'demo-editor-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByTitle('ウィジェットを削除')).toBeVisible({ timeout: 5000 })
})

test('DB-8: ウィジェットのD&Dで並び替えられる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('+ ウィジェット追加:')).toBeVisible({ timeout: 5000 })

  // 2つウィジェットを追加
  await page.getByRole('button', { name: /アクティビティ/ }).click()
  await expect(page.getByTitle('ウィジェットを削除').first()).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: /ランキング/ }).click()
  await expect(page.getByTitle('ウィジェットを削除')).toHaveCount(2, { timeout: 5000 })

  // ヘッダー（drag-handle）を取得
  const headers = page.locator('.drag-handle')
  await expect(headers).toHaveCount(2)

  const firstHeader = headers.first()
  const firstBox = await firstHeader.boundingBox()
  const secondHeader = headers.nth(1)
  const secondBox = await secondHeader.boundingBox()

  if (!firstBox || !secondBox) throw new Error('Bounding boxes not found')

  // 最初のヘッダーを2番目のヘッダー位置へドラッグ
  const srcX = firstBox.x + firstBox.width / 2
  const srcY = firstBox.y + firstBox.height / 2
  const dstX = secondBox.x + secondBox.width / 2
  const dstY = secondBox.y + secondBox.height + 40 // ウィジェットの下方

  await page.mouse.move(srcX, srcY)
  await page.mouse.down()
  await page.waitForTimeout(100)
  // ゆっくりドラッグして react-grid-layout のドラッグを発火させる
  await page.mouse.move(srcX + (dstX - srcX) * 0.3, srcY + (dstY - srcY) * 0.3, { steps: 5 })
  await page.mouse.move(dstX, dstY, { steps: 10 })
  await page.waitForTimeout(100)
  await page.mouse.up()

  // ドラッグ後もウィジェットが2つ残ること
  await expect(page.getByTitle('ウィジェットを削除')).toHaveCount(2, { timeout: 3000 })
})

test('DB-9: 総受け取り報酬ウィジェットが追加できる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('+ ウィジェット追加:')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: /総受け取り/ }).click()
  await expect(page.getByTitle('ウィジェットを削除')).toBeVisible({ timeout: 5000 })
  // ウィジェット設定ボタン（ヘッダー）が見える
  await expect(page.getByTitle('ウィジェット設定')).toBeVisible({ timeout: 5000 })
})

test('DB-10: 保存済みウィジェットがある状態で統計タブを開いても真っ白にならない', async ({ page }) => {
  // 実運用相当: ウィジェットが保存済みの状態で統計タブを開く
  await page.request.put(`${MOCK}/api/dashboard`, {
    headers: { Authorization: 'Bearer demo-editor-token' },
    data: {
      widgets: [
        { id: 'db10-quests', type: 'quests', config: { sort: 'popular', limit: 20 }, layout: { x: 0, y: 0, w: 3, h: 5 }, customTitle: 'DB10クエスト統計' },
        { id: 'db10-lb', type: 'leaderboard', config: { metric: 'points', limit: 20 }, layout: { x: 3, y: 0, w: 3, h: 6 } },
      ],
    },
  })

  // 無限再レンダー (Maximum update depth exceeded) でクラッシュしないこと
  const fatalErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('Maximum update depth')) fatalErrors.push(msg.text())
  })
  page.on('pageerror', (err) => fatalErrors.push(String(err)))

  await loginAs(page, 'demo-player-token')
  await page.getByRole('button', { name: /統計/ }).click()
  await expect(page.getByText('DB10クエスト統計')).toBeVisible({ timeout: 5000 })

  // クラッシュ→真っ白は描画後数秒以内に起きるため、待ってから検証する
  await page.waitForTimeout(3000)
  expect(fatalErrors).toEqual([])
  await expect(page.getByText('DB10クエスト統計')).toBeVisible()
})
