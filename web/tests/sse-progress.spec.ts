/**
 * SSE通知・進捗関連テスト
 * 20.   SSE クエスト完了でオーバーレイが表示される
 * 20b.  完了オーバーレイ: クリックで閉じる
 * 20c.  完了オーバーレイ: 次の通知で内容が差し替わる
 * 20d.  完了オーバーレイ: 自動的に消える
 * 20e.  完了オーバーレイ: モード切替で再表示しない
 * 23.   達成済み表示: 完了クエストノードに金枠+チェック
 * 24.   達成演出: SSE完了通知でノードがキラキラ→達成済み
 * 25.   progress_update: 達成/未達成の切替が演出なしで即反映
 * WA1.  条件チェックマーク: progress_update受信でモーダル内の条件にチェック
 * WA2.  アイテム条件部分達成: プログレスバー+数値が表示される
 * WA3.  全条件達成後: 報酬受取ボタンが表示される
 * WB1.  未完了クエスト: 報酬受取ボタンが出ない
 * WB2.  完了済み未受取: 報酬受取ボタンが表示される
 * WB3.  完了済み受取済み: 報酬受取ボタンが出ない
 * WB4.  報酬受取: ボタン押下後にAPI呼び出しされボタンが消える
 */

import { test, expect } from '@playwright/test'
import {
  loginAs, openQuestModal,
  resetProgress, setProgress, setConditionProgress,
  notifyQuestComplete, notifyProgressUpdate,
  EDITOR_UUID, MOCK,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// ---------------------------------------------------------------------------
// 完了オーバーレイ
// ---------------------------------------------------------------------------

test('SSE通知: クエスト完了でブラウザにオーバーレイが表示される (20)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await notifyQuestComplete(page, 'demo-editor-token', 1, 'テストクエスト達成！')

  await expect(page.getByTestId('quest-complete-overlay')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('クエスト完了！')).toBeVisible()
  await expect(page.getByText('テストクエスト達成！')).toBeVisible()
  await expect(page.getByText('が達成しました')).not.toBeVisible()
})

test('完了オーバーレイ: クリックで閉じる (20b)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await notifyQuestComplete(page, 'demo-editor-token', 1, 'クリックで閉じる')

  const overlay = page.getByTestId('quest-complete-overlay')
  await expect(overlay).toBeVisible({ timeout: 5000 })
  await overlay.click()
  await expect(overlay).not.toBeVisible({ timeout: 2000 })
})

test('完了オーバーレイ: 次の通知で内容が差し替わる (20c)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await notifyQuestComplete(page, 'demo-editor-token', 1, '最初の通知')
  await expect(page.getByText('最初の通知')).toBeVisible({ timeout: 5000 })

  await notifyQuestComplete(page, 'demo-editor-token', 2, '次の通知')
  await expect(page.getByText('次の通知')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('最初の通知')).not.toBeVisible()
})

test('完了オーバーレイ: 自動的に消える (20d)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await notifyQuestComplete(page, 'demo-editor-token', 1, '自動で消える')

  const overlay = page.getByTestId('quest-complete-overlay')
  await expect(overlay).toBeVisible({ timeout: 5000 })
  await expect(overlay).not.toBeVisible({ timeout: 6000 })
})

test('完了オーバーレイ: モード切替で再表示・再演出しない (20e)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await notifyQuestComplete(page, 'demo-editor-token', 1, 'モード切替テスト')

  const overlay = page.getByTestId('quest-complete-overlay')
  await expect(overlay).toBeVisible({ timeout: 5000 })
  await overlay.click()
  await expect(overlay).not.toBeVisible({ timeout: 2000 })

  for (let i = 0; i < 3; i++) {
    await page.getByTitle('プレイモード').click()
    await page.getByTitle('編集モード').click()
  }
  await expect(overlay).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// 達成済み表示・演出
// ---------------------------------------------------------------------------

test('達成済み表示: 完了クエストノードに金枠+チェックが表示される (23)', async ({ page }) => {
  await resetProgress(page)
  await setProgress(page, EDITOR_UUID, 1, { completed: true })
  await loginAs(page, 'demo-editor-token')

  const node1 = page.locator('[data-node-id="1"]')
  await expect(node1).toHaveAttribute('data-completed', 'true', { timeout: 8000 })
  await expect(node1.getByTitle('達成済み')).toBeVisible()
  await expect(page.locator('[data-node-id="2"]')).not.toHaveAttribute('data-completed', 'true')
})

test('達成演出: SSE完了通知でノードがキラキラ→達成済みになる (24)', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-editor-token')

  const node1 = page.locator('[data-node-id="1"]')
  await expect(node1).not.toHaveAttribute('data-completed', 'true')

  await setProgress(page, EDITOR_UUID, 1, { completed: true })
  await notifyQuestComplete(page, 'demo-editor-token', 1, '基本')

  await expect(node1).toHaveAttribute('data-celebrating', 'true', { timeout: 5000 })
  await expect(page.getByTestId('quest-complete-overlay')).toBeVisible({ timeout: 5000 })
  await expect(node1).toHaveAttribute('data-completed', 'true', { timeout: 8000 })
  await expect(node1).not.toHaveAttribute('data-celebrating', 'true', { timeout: 8000 })
})

test('進捗更新通知: progress_updateで達成→未達成が演出なしで即反映される (25)', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-editor-token')

  const node1 = page.locator('[data-node-id="1"]')

  await setProgress(page, EDITOR_UUID, 1, { completed: true })
  await notifyProgressUpdate(page, 'demo-editor-token', 1, true)
  await expect(node1).toHaveAttribute('data-completed', 'true', { timeout: 5000 })
  await expect(node1).not.toHaveAttribute('data-celebrating', 'true')
  await expect(page.getByTestId('quest-complete-overlay')).not.toBeVisible()

  await setProgress(page, EDITOR_UUID, 1, { completed: false })
  await notifyProgressUpdate(page, 'demo-editor-token', 1, false)
  await expect(node1).not.toHaveAttribute('data-completed', 'true', { timeout: 5000 })
})

// ---------------------------------------------------------------------------
// モーダル内の条件進捗 (WA)
// ---------------------------------------------------------------------------

test('条件チェックマーク: progress_update受信でモーダル内の条件にチェックが付く (WA1)', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await expect(page.getByTitle('達成済み')).not.toBeVisible()

  await setConditionProgress(page, EDITOR_UUID, 1, [{ conditionId: 'cond-1-adv', completed: true }], { completed: true })
  await notifyProgressUpdate(page, 'demo-editor-token', 1, true)

  // ノードバッジ ([data-node-id] の直下) ではなくモーダル内のチェックを待つ
  await expect(page.locator(':not([data-node-id]) > [title="達成済み"]')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

test('アイテム条件: progress_updateでプログレスバーは表示されず、完了時のみ達成マークが出る (WA2)', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '2')
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveValue('石器時代')

  // item タイプは途中進捗を保存しないのでプログレスバーは出ない
  await setConditionProgress(
    page, EDITOR_UUID, 2,
    [{ conditionId: 'cond-2-item', completed: false }],
    { completed: false },
  )
  await notifyProgressUpdate(page, 'demo-editor-token', 2, false)

  await expect(page.getByText('1/3')).not.toBeVisible()
  await expect(page.getByTitle('達成済み')).not.toBeVisible()

  // 完了状態にすると達成マークが出る
  await setConditionProgress(
    page, EDITOR_UUID, 2,
    [{ conditionId: 'cond-2-item', completed: true }],
    { completed: true, rewardClaimed: false },
  )
  await notifyProgressUpdate(page, 'demo-editor-token', 2, true)

  // ノードバッジではなくモーダル内の達成マークを確認
  await expect(page.locator(':not([data-node-id]) > [title="達成済み"]')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

test('全条件達成後: progress_update後に報酬受取ボタンが表示される (WA3)', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await expect(page.getByText('★ 報酬を受け取る')).not.toBeVisible()

  await setConditionProgress(
    page, EDITOR_UUID, 1,
    [{ conditionId: 'cond-1-adv', completed: true }],
    { completed: true, rewardClaimed: false },
  )
  await notifyProgressUpdate(page, 'demo-editor-token', 1, true)

  await expect(page.getByText('★ 報酬を受け取る')).toBeVisible({ timeout: 5000 })

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// ---------------------------------------------------------------------------
// 報酬受取ボタン (WB)
// ---------------------------------------------------------------------------

test('未完了クエスト: モーダルに報酬受取ボタンが表示されない (WB1)', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await expect(page.getByText('★ 報酬を受け取る')).not.toBeVisible()

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

test('完了済み未受取: モーダルに報酬受取ボタンが表示される (WB2)', async ({ page }) => {
  await resetProgress(page)
  await setProgress(page, EDITOR_UUID, 1, { completed: true, rewardClaimed: false })
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await expect(page.getByText('★ 報酬を受け取る')).toBeVisible({ timeout: 3000 })

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

test('完了済み受取済み: モーダルに報酬受取ボタンが表示されない (WB3)', async ({ page }) => {
  await resetProgress(page)
  await setProgress(page, EDITOR_UUID, 1, { completed: true, rewardClaimed: true })
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await expect(page.getByText('★ 報酬を受け取る')).not.toBeVisible()

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

test('報酬受取: ボタンを押すとAPI呼び出し後ボタンが消える (WB4)', async ({ page }) => {
  await resetProgress(page)
  await setProgress(page, EDITOR_UUID, 1, { completed: true, rewardClaimed: false })
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  const claimBtn = page.getByText('★ 報酬を受け取る')
  await expect(claimBtn).toBeVisible({ timeout: 3000 })
  await claimBtn.click()
  await expect(claimBtn).not.toBeVisible({ timeout: 5000 })

  const res = await page.request.get(`${MOCK}/api/progress/1`, {
    headers: { Authorization: 'Bearer demo-editor-token' },
  })
  expect((await res.json()).rewardClaimed).toBe(true)

  await page.getByRole('button', { name: '閉じる' }).last().click()
})
