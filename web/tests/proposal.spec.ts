/**
 * 提案モード・承認関連テスト
 *  6. 提案モード ON
 *  7. 提案ドラフトノード追加
 *  8. 提案ドラフトをクリック → モーダルが開く
 *  9. 提案モード: 既存クエストノードを読み取り専用で開ける
 * 10. 提案モードキャンセル
 * 16. 提案送信フルシナリオ
 * 17. 承認フル
 * 18. 送信済み提案ノードを開いていいねできる
 * 19. 提案ノードのマップ上にスキンアイコンが表示される
 * 29. 編集者が提案ノードを移動して保存できる
 */

import { test, expect } from '@playwright/test'
import { loginAs, loggedInBtn, resetProposals, MOCK, resetAll } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// 6
test('提案モード ON: ツールバー拡張・ナビバーに提案バー', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()

  await expect(page.getByText(/提案モード/)).toBeVisible()
  await expect(page.locator('nav button', { hasText: '✕' })).toBeVisible()
  await expect(page.getByTitle('移動')).toBeVisible()
  await expect(page.getByTitle('クエストを追加')).toBeVisible()
  await expect(page.getByTitle('依存関係を追加')).toBeVisible()
  await expect(page.getByTitle('削除')).toBeVisible()
})

// 7
test('提案モード: クエスト追加ツールでクリック → ドラフトノード生成', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const before = await page.locator('[data-node-id]').count()
  await canvas.click({ position: { x: 300, y: 300 } })
  await expect(page.locator('[data-node-id]')).toHaveCount(before + 1, { timeout: 3000 })
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 5000 })
})

// 8
test('提案ドラフトノード: selectモードでクリックするとモーダルが開く', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  await canvas.click({ position: { x: 300, y: 300 } })
  await expect(page.locator('[data-node-id]').last()).toBeVisible()

  await page.getByTitle('選択').click()
  await canvas.click({ position: { x: 300, y: 300 } })
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
})

// 9
test('提案モード: 既存クエストノードを読み取り専用で開ける', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()

  const existingNode = page.locator('[data-node-id]:not([data-node-id^="draft-"]):not([data-node-id^="existing-proposal-"])').first()
  const box = await existingNode.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// 10
test('提案モードキャンセル: ドラフト消滅・ツールバー縮小', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const before = await page.locator('[data-node-id]').count()
  await canvas.click({ position: { x: 300, y: 300 } })
  await expect(page.locator('[data-node-id]')).toHaveCount(before + 1, { timeout: 3000 })

  await page.locator('nav button', { hasText: '✕' }).click()

  await expect(page.getByTitle('クエストを追加')).not.toBeVisible()
  await expect(page.locator('[data-node-id]')).toHaveCount(before, { timeout: 3000 })
  await expect(page.getByText('クエスト追加を提案する')).toBeVisible()
})

// 16
test('提案送信: 送信後も提案モードで見える / 終了後・ログアウト後・再提案モードで表示制御が正しい', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await expect(page.getByText(/提案モード/)).toBeVisible()

  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const base = await page.locator('[data-node-id]').count()
  await canvas.click({ position: { x: 500, y: 300 } })
  await expect(page.locator('[data-node-id]')).toHaveCount(base + 1, { timeout: 3000 })

  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  await expect(page.getByText(/提案モード/)).toBeVisible()
  await expect(page.locator('[data-node-id]')).toHaveCount(base + 1, { timeout: 5000 })
  await expect(page.locator('nav button', { hasText: '📤' })).not.toBeVisible()

  await page.locator('nav button', { hasText: '✕' }).click()
  await expect(page.getByText(/提案モード/)).not.toBeVisible()
  await expect(page.locator('[data-node-id]')).toHaveCount(base, { timeout: 3000 })

  await loggedInBtn(page).click()
  await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })
  await expect(page.locator('[data-node-id]')).toHaveCount(base, { timeout: 3000 })

  await page.locator('button[title="ログイン"]').click()
  await page.getByText('🎮 プレイヤーとしてログイン').click()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  await expect(page.locator('[data-node-id]')).toHaveCount(base, { timeout: 3000 })

  await page.getByText('クエスト追加を提案する').click()
  await expect(page.getByText(/提案モード/)).toBeVisible()
  await expect(page.locator('[data-node-id]')).toHaveCount(base + 1, { timeout: 5000 })

  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-player-token' } })
  await page.reload()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  await page.getByText('クエスト追加を提案する').click()
  await expect(page.locator('[data-node-id]')).toHaveCount(base + 1, { timeout: 5000 })

  await loggedInBtn(page).click()
  await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })
  await page.locator('button[title="ログイン"]').click()
  await page.getByText('✏️ 編集者としてログイン').click()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  // editor はデフォルトプレイモード → 編集モードに切り替えて提案ノードを確認
  // 注意: editor の編集モードでは hidden クエストも表示されるため、提案ノードを id で直接確認する
  // editor が編集モードで見る提案ノードは existing-proposal-{id} という id を持つ
  await page.getByTitle('編集モード').click()
  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(1, { timeout: 5000 })
})

// 17
test('承認フル: 編集者が提案を承認 → 通常ノード表示 → 保存 → リロード後も保持', async ({ page }) => {
  await resetProposals(page)

  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  await canvas.click({ position: { x: 550, y: 350 } })
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 3000 })
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })
  await loggedInBtn(page).click()
  await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })

  await page.locator('button[title="ログイン"]').click()
  await page.getByText('✏️ 編集者としてログイン').click()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  // editor はデフォルトプレイモード → 編集モードに切り替えて提案ノードを確認
  await page.getByTitle('編集モード').click()
  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(1, { timeout: 5000 })
  const total = await page.locator('[data-node-id]').count()

  const proposalNode = page.locator('[data-node-id^="existing-proposal-"]').first()
  const box = await proposalNode.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByText('✓ 承認')).toBeVisible({ timeout: 3000 })
  await page.getByText('✓ 承認').click()
  await expect(page.getByText('✓ 承認')).not.toBeVisible({ timeout: 3000 })
  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(0, { timeout: 5000 })
  await expect(page.locator('[data-node-id]')).toHaveCount(total, { timeout: 5000 })

  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  await loginAs(page, 'demo-editor-token')
  await expect(page.locator('[data-node-id]')).toHaveCount(total, { timeout: 5000 })
})

// 18
test('提案モード: 送信済み提案ノードを開いていいねできる', async ({ page }) => {
  await resetProposals(page)

  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  await canvas.click({ position: { x: 500, y: 300 } })
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 3000 })
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(1, { timeout: 5000 })
  await page.locator('button[title="選択"]').click()
  const proposalNode = page.locator('[data-node-id^="existing-proposal-"]').first()
  const box = await proposalNode.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveAttribute('readonly', '')

  const likeBtn = page.getByRole('button', { name: /👍/ })
  await expect(likeBtn).toBeVisible()
  await likeBtn.click()
  await expect(page.getByRole('button', { name: /👍 1/ })).toBeVisible({ timeout: 3000 })

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// 19
test('提案ノード: マップ上に提案者スキンアイコンが表示される', async ({ page }) => {
  await resetProposals(page)

  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  await canvas.click({ position: { x: 500, y: 300 } })
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  const proposalNode = page.locator('[data-node-id^="existing-proposal-"]').first()
  await expect(proposalNode).toBeVisible({ timeout: 5000 })
  await expect(proposalNode.locator('img[src*="mc-heads.net"]')).toBeVisible()
})

// 29
test('提案ノード移動: 編集者が提案モードで提案ノードをドラッグ → 保存で位置がAPIに反映される', async ({ page }) => {
  await resetProposals(page)

  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  await canvas.click({ position: { x: 500, y: 300 } })
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })
  await loggedInBtn(page).click()
  await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })

  await page.locator('button[title="ログイン"]').click()
  await page.getByText('✏️ 編集者としてログイン').click()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  // editor はデフォルトプレイモード → 編集モードに切り替え
  await page.getByTitle('編集モード').click()

  await page.getByText('クエスト追加を提案する').click()
  await expect(page.getByText(/提案モード/)).toBeVisible()
  const proposalNode = page.locator('[data-node-id^="existing-proposal-"]').first()
  await expect(proposalNode).toBeVisible({ timeout: 8000 })

  const before = await proposalNode.boundingBox()
  const cx = before!.x + before!.width / 2
  const cy = before!.y + before!.height / 2
  await page.getByTitle('移動').click()
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 100, cy + 80, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  const after = await proposalNode.boundingBox()
  expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(20)

  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 3000 })
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  const res = await page.request.get(`${MOCK}/api/proposals`, {
    headers: { Authorization: 'Bearer demo-editor-token' },
  })
  const proposals = await res.json()
  expect(proposals.length).toBeGreaterThan(0)
  expect(Math.abs(proposals[0].mapPosition.x - 500)).toBeGreaterThan(20)
})
