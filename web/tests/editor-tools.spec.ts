/**
 * 編集操作・保存関連テスト
 * 11. 編集者: 移動ツールでノードをドラッグ → 位置が変わる
 * 13. 未ログイン: クエストクリックで読み取り専用モーダルが開く
 * 14. 保存永続化: ノード移動後に保存するとリロード後も位置が保持される
 * 21. タスク保存: advancement 条件を追加して保存→リロード後も保持
 * 22. タスク保存: item 条件を追加して保存→リロード後も itemType が保持
 * W-D. モードトースト・ツールバー表示制御
 * W-E. 依存関係（エッジ）の作成と保存
 * W-F. パンの初期位置（最左上ノードがビューポート内）
 */

import { test, expect } from '@playwright/test'
import { loginAs, loggedInBtn, MOCK } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// 11
test('編集者: 選択ツール長押しドラッグでノード位置が変わる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const box = await canvas.boundingBox()
  const nx = box!.x + 100
  const ny = box!.y + 100

  await page.mouse.move(nx, ny)
  await page.mouse.down()
  await page.waitForTimeout(220)
  await page.mouse.move(nx + 80, ny + 60, { steps: 10 })
  await page.mouse.up()

  const style = await page.locator('[data-node-id="1"]').getAttribute('style')
  expect(style).not.toContain('left: 100px')
})

// 13
test('未ログイン: クエストノードをクリックすると読み取り専用モーダルが開く', async ({ page }) => {
  await expect(loggedInBtn(page)).not.toBeVisible()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const box = await canvas.boundingBox()
  await page.mouse.click(box!.x + 100, box!.y + 100)

  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveAttribute('readonly', '')

  await page.getByRole('button', { name: '閉じる' }).last().click()
  await expect(page.getByPlaceholder('クエストのタイトル')).not.toBeVisible()
})

// 14
test('保存永続化: 編集者がノード移動後に保存するとリロード後も位置が保持される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const box = await canvas.boundingBox()
  const nx = box!.x + 100
  const ny = box!.y + 100

  await page.mouse.move(nx, ny)
  await page.mouse.down()
  await page.waitForTimeout(220)
  await page.mouse.move(nx + 120, ny + 80, { steps: 15 })
  await page.mouse.up()

  const styleBefore = await page.locator('[data-node-id="1"]').getAttribute('style')
  expect(styleBefore).not.toContain('left: 100px')

  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-editor-token' } })
  await page.reload()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })

  const styleAfter = await page.locator('[data-node-id="1"]').getAttribute('style')
  expect(styleAfter).not.toContain('left: 100px')
})

test('編集者: 作成モードで追加した直後に編集モーダルが開く', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  await page.getByTitle('クエストを追加').click()
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const before = await page.locator('[data-node-id]').count()
  await canvas.click({ position: { x: 260, y: 220 } })

  await expect(page.locator('[data-node-id]')).toHaveCount(before + 1, { timeout: 3000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveValue('新規クエスト')
})

// 21
test('タスク保存: advancement 条件を追加して保存するとリロード後も保持される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  const node1 = page.locator('[data-node-id="1"]')
  await expect(node1).toBeVisible({ timeout: 5000 })
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 5000 })

  await page.locator('button.hover\\:bg-white\\/10').first().click()
  await page.locator('.px-3.py-2').filter({ hasText: '🏆' }).click()

  await expect(page.getByPlaceholder('minecraft:story/mine_wood')).toBeVisible({ timeout: 3000 })
  await page.getByPlaceholder('minecraft:story/mine_wood').fill('minecraft:story/mine_stone')
  await page.getByRole('button', { name: '完了' }).click()

  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect(page.getByText('🏆').first()).toBeVisible()
  await page.getByRole('button', { name: '閉じる' }).last().click()

  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  const quest = await (await page.request.get(`${MOCK}/api/quests/1`)).json()
  const adv = quest.conditions.find((c: any) => c.type === 'advancement')
  expect(adv).toBeDefined()
  expect(adv.advancementId).toBe('minecraft:story/mine_stone')

  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-editor-token' } })
  await page.reload()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  const node1r = page.locator('[data-node-id="1"]')
  await expect(node1r).toBeVisible({ timeout: 5000 })
  const box2 = await node1r.boundingBox()
  await page.mouse.click(box2!.x + box2!.width / 2, box2!.y + box2!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('🏆').first()).toBeVisible()
  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// 22
test('タスク保存: item 条件を追加して保存するとリロード後も itemType が保持される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  const node1 = page.locator('[data-node-id="1"]')
  await expect(node1).toBeVisible({ timeout: 5000 })
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 5000 })

  await page.locator('button.hover\\:bg-white\\/10').first().click()
  await page.locator('.px-3.py-2').filter({ hasText: '📦' }).first().click()

  await expect(page.locator('input[type="number"]').first()).toBeVisible({ timeout: 3000 })
  await page.locator('input[type="number"]').first().fill('5')
  await page.getByRole('button', { name: '完了' }).click()

  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await page.getByRole('button', { name: '閉じる' }).last().click()

  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  const quest = await (await page.request.get(`${MOCK}/api/quests/1`)).json()
  const item = quest.conditions.find((c: any) => c.type === 'item')
  expect(item).toBeDefined()
  expect(item.itemType).toBe('stone')
  expect(item.count).toBe(5)

  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-editor-token' } })
  await page.reload()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  const node1r = page.locator('[data-node-id="1"]')
  await expect(node1r).toBeVisible({ timeout: 5000 })
  const box2 = await node1r.boundingBox()
  await page.mouse.click(box2!.x + box2!.width / 2, box2!.y + box2!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('img[src*="stone"]').first()).toBeVisible()
  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// ---------------------------------------------------------------------------
// W-D: モードトースト・ツールバー表示制御
// ---------------------------------------------------------------------------

// W-D-1
test('モードトースト: ツール切り替えでトーストが表示され数秒後に消える (W-D-1)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // プレイモードに切り替えるとトーストが出る
  // (ModeToast は opacity で表示/非表示を制御しているため、CSS opacity を確認する)
  await page.getByTitle('プレイモード').click()
  const toast = page.locator('.bottom-12.z-50')

  // opacity が 1 になること (表示状態)
  await expect.poll(
    () => toast.evaluate((el) => parseFloat(getComputedStyle(el).opacity)),
    { timeout: 2000 },
  ).toBeGreaterThan(0.5)

  // 3秒後に opacity が 0 に戻ること (非表示状態)
  await expect.poll(
    () => toast.evaluate((el) => parseFloat(getComputedStyle(el).opacity)),
    { timeout: 4000 },
  ).toBeLessThan(0.1)
})

// W-D-2
test('モードツールバー: 編集者・編集モードで全ツールが表示される (W-D-2)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  // 編集者はログイン後に自動で編集モードになる
  await expect(page.getByTitle('選択')).toBeVisible()
  await expect(page.getByTitle('クエストを追加')).toBeVisible()
  await expect(page.getByTitle('依存関係を追加')).toBeVisible()
  await expect(page.getByTitle('削除')).toBeVisible()
})

// W-D-3
test('モードツールバー: 編集者・プレイモードではツール群が非表示になる (W-D-3)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByTitle('プレイモード').click()
  await expect(page.getByTitle('選択')).not.toBeVisible()
  await expect(page.getByTitle('クエストを追加')).not.toBeVisible()
})

// W-D-4
test('モードツールバー: プレイヤーは提案モード外では選択ツールのみ (W-D-4)', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await expect(page.getByTitle('クエストを追加')).not.toBeVisible()
  // 選択ツールは表示されていること
  await expect(page.getByTitle('選択')).toBeVisible()
})

// ---------------------------------------------------------------------------
// W-E: 依存関係（エッジ）の作成と保存
// ---------------------------------------------------------------------------

// W-E-1
test('エッジ作成: add_linkモードで2ノードをクリックするとエッジが描画される (W-E-1)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  const edgesBefore = await page.locator('svg line, svg path').count()

  // add_link モードに切り替えてノード1→ノード3をクリック
  await page.getByTitle('依存関係を追加').click()
  const node1 = page.locator('[data-node-id="1"]')
  const node3 = page.locator('[data-node-id="3"]')
  const box1 = await node1.boundingBox()
  const box3 = await node3.boundingBox()
  await page.mouse.click(box1!.x + box1!.width / 2, box1!.y + box1!.height / 2)
  await page.mouse.click(box3!.x + box3!.width / 2, box3!.y + box3!.height / 2)

  // SVG のエッジ (line/path) が増えていること
  await expect.poll(
    () => page.locator('svg line, svg path').count(),
    { timeout: 3000 },
  ).toBeGreaterThan(edgesBefore)
})

// W-E-2
test('エッジ保存: 依存関係を保存してリロード後も保持される (W-E-2)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // add_link モードでノード1→ノード3を繋ぐ
  await page.getByTitle('依存関係を追加').click()
  const node1 = page.locator('[data-node-id="1"]')
  const node3 = page.locator('[data-node-id="3"]')
  const box1 = await node1.boundingBox()
  const box3 = await node3.boundingBox()
  await page.mouse.click(box1!.x + box1!.width / 2, box1!.y + box1!.height / 2)
  await page.mouse.click(box3!.x + box3!.width / 2, box3!.y + box3!.height / 2)

  const edgesAfter = await page.locator('svg line, svg path').count()

  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-editor-token' } })
  await page.reload()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })

  // リロード後もエッジ数が同じであること
  await expect.poll(
    () => page.locator('svg line, svg path').count(),
    { timeout: 5000 },
  ).toBeGreaterThanOrEqual(edgesAfter)
})

// ---------------------------------------------------------------------------
// W-F: パンの初期位置
// ---------------------------------------------------------------------------

// W-F-1
test('パン初期位置: ページロード後に最左上ノードがビューポート内に表示される (W-F-1)', async ({ page }) => {
  // 最初のノードがビューポート内にあること
  const firstNode = page.locator('[data-node-id]').first()
  await expect(firstNode).toBeVisible({ timeout: 10000 })

  const box = await firstNode.boundingBox()
  const vp = page.viewportSize()!

  // ノードがビューポートの範囲内 (PADDING=80px 考慮)
  expect(box!.x).toBeGreaterThan(0)
  expect(box!.y).toBeGreaterThan(0)
  expect(box!.x + box!.width).toBeLessThan(vp.width)
  expect(box!.y + box!.height).toBeLessThan(vp.height)
})

test('タブ管理: editor がタブを追加・並び替え・削除できる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  page.once('dialog', (dialog) => dialog.accept('探索'))
  await page.getByTitle('タブを追加').click()
  const createdTabs = await (await page.request.get(`${MOCK}/api/tabs`)).json()
  expect(createdTabs.map((tab: { name: string }) => tab.name)).toContain('探索')
  await page.getByRole('button', { name: 'すべて' }).click()

  const node1 = page.locator('[data-node-id="1"]')
  const box = await node1.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await page.locator('select').last().selectOption('探索')
  await page.getByRole('button', { name: '閉じる' }).last().click()

  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  const quest = await (await page.request.get(`${MOCK}/api/quests/1`)).json()
  expect(quest.category).toBe('探索')

  await page.getByText('探索').first().click()
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
