/**
 * 繰り返しクエスト機能テスト
 * RP-1. 編集モード: 繰り返しタイプ選択UI (なし/クールダウン/時刻指定/無制限) が表示される
 * RP-2. クールダウン選択時: 時間入力が現れ、cron式入力は現れない
 * RP-3. 時刻指定選択時: cron式入力とプリセットボタンが現れる
 * RP-4. プレイヤー: 繰り返しクエスト達成済みで pendingRewards>1 のとき受取ボタンに件数が出る
 */

import { test, expect } from '@playwright/test'
import { loginAs, openQuestModal, setProgress, PLAYER_UUID, MOCK, resetAll } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

test('RP-1: 編集モードで繰り返しタイプ選択UIが表示される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  // 繰り返しセクションのラベル
  await expect(page.getByText('繰り返し', { exact: true })).toBeVisible()
  // 4つのタイプボタン
  await expect(page.getByRole('button', { name: 'なし' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'クールダウン' })).toBeVisible()
  await expect(page.getByRole('button', { name: '時刻指定' })).toBeVisible()
  await expect(page.getByRole('button', { name: '無制限' })).toBeVisible()
})

test('RP-2: クールダウン選択で時間+分入力と復活プレビューが現れる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await page.getByRole('button', { name: 'クールダウン' }).click()
  await expect(page.getByText('復活までの時間')).toBeVisible()
  // 時間・分の単位ラベルが両方出る
  await expect(page.getByText('時間', { exact: true })).toBeVisible()
  await expect(page.getByText('分', { exact: true })).toBeVisible()
  // 「今達成したら: ... に復活 (... 後)」のプレビューが出る
  await expect(page.getByText(/今達成したら:.*に復活.*後/)).toBeVisible()
  // cron式入力は出ない
  await expect(page.getByPlaceholder('分 時 日 月 曜日')).toHaveCount(0)
})

test('RP-2b: クールダウンに分を入力するとプレビューに反映される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await page.getByRole('button', { name: 'クールダウン' }).click()
  const inputs = page.locator('input[type="number"]')
  // 1番目=時間, 2番目=分
  await inputs.nth(0).fill('1')
  await inputs.nth(1).fill('30')
  // 1h 30m 後 のプレビュー
  await expect(page.getByText(/1h 30m 後/)).toBeVisible()
})

test('RP-3: 時刻指定選択でcron式入力とプリセットが現れる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await page.getByRole('button', { name: '時刻指定' }).click()
  await expect(page.getByPlaceholder('分 時 日 月 曜日')).toBeVisible()
  // プリセットボタン
  await expect(page.getByRole('button', { name: '毎日0時' })).toBeVisible()

  // プリセットをクリックすると cron 式が入る
  await page.getByRole('button', { name: '毎時00分' }).click()
  await expect(page.getByPlaceholder('分 時 日 月 曜日')).toHaveValue('0 * * * *')
})

test('RP-4: pendingRewards>1で受取ボタンに件数が表示される', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  // 繰り返しクエスト想定: 完了済み + pendingRewards=3
  await page.request.post(`${MOCK}/api/test/set-progress`, {
    data: { playerUuid: PLAYER_UUID, questId: 1, completed: true, pendingRewards: 3 },
  })
  await page.reload()
  await openQuestModal(page, '1')

  await expect(page.getByRole('button', { name: /報酬を受け取る.*×3/ })).toBeVisible()
})

test('RP-5b: 繰り返し設定を保存するとリロード後も設定が保持される (保存バグ回帰)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  // クールダウンを選択して設定
  await page.getByRole('button', { name: 'クールダウン' }).click()
  await expect(page.getByText('復活までの時間')).toBeVisible()

  // 閉じて保存
  await page.getByRole('button', { name: '閉じる' }).last().click()
  await page.locator('#nav-save-btn').click()
  await expect(page.locator('#nav-save-btn')).not.toBeDisabled()

  // リロードして設定が残っているか確認
  await page.reload()
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  // クールダウンボタンがアクティブになっている
  const cooldownBtn = page.getByRole('button', { name: 'クールダウン' })
  await expect(cooldownBtn).toHaveClass(/bg-blue-600/)
  await expect(page.getByText('復活までの時間')).toBeVisible()
})

test('RP-5: cron入力欄に連続入力してもフォーカスが外れない (再マウント回帰)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  await page.getByRole('button', { name: '時刻指定' }).click()
  const cron = page.getByPlaceholder('分 時 日 月 曜日')
  await cron.click()
  // 1文字ずつ打ってもフォーカスが維持される (以前は再マウントで毎回外れていた)
  await page.keyboard.press('Control+A')
  await page.keyboard.type('15 9 * * 1', { delay: 30 })
  await expect(cron).toBeFocused()
  await expect(cron).toHaveValue('15 9 * * 1')
})
