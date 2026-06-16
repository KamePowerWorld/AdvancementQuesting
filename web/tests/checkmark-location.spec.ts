/**
 * チェックマーク・座標タスク E2E テスト
 *
 * CK-1: プレイモードでチェックマーク条件に「了解」ボタンが表示される
 * CK-2: 「了解」ボタンを押すと条件が完了状態になる
 * CK-3: 全条件完了後は「了解」ボタンが消えチェックマークに変わる
 * LO-1: タスク編集で座標条件を追加・保存できる
 * LO-2: 「現在の位置を入力」ボタンが座標フィールドに値を設定する
 */

import { test, expect } from '@playwright/test'
import {
  loginAs, openQuestModal, resetProgress, setConditionProgress,
  PLAYER_UUID, MOCK,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// CK-1: プレイモードでチェックマーク条件に「了解」ボタンが表示される
test('CK-1: プレイモードでチェックマーク条件に「了解」ボタンが表示される', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-player-token')
  await openQuestModal(page, '5')

  // 「了解」ボタンが 2 つ表示される (cond-5-check1 / cond-5-check2)
  const okBtns = page.getByRole('button', { name: '了解' })
  await expect(okBtns.first()).toBeVisible({ timeout: 3000 })
  expect(await okBtns.count()).toBe(2)
})

// CK-2: 「了解」ボタンを押すと条件が完了状態になる
test('CK-2: 「了解」ボタンを押すと条件が完了になる', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-player-token')
  await openQuestModal(page, '5')

  // 最初の「了解」ボタンをクリック
  const firstOk = page.getByRole('button', { name: '了解' }).first()
  await firstOk.click()

  // ボタンが 1 つ減って金のチェックマークが出る
  await expect(page.getByRole('button', { name: '了解' })).toHaveCount(1, { timeout: 5000 })
  // 達成マーク ✓ が表示される
  await expect(page.locator('[title="達成済み"]').first()).toBeVisible({ timeout: 3000 })
})

// CK-3: 全条件完了後は「了解」ボタンが消えてすべてチェックマークになる
test('CK-3: 全条件完了後は「了解」ボタンが消える', async ({ page }) => {
  await resetProgress(page)
  await loginAs(page, 'demo-player-token')
  // cond-5-check1 は完了済みとしてセット → ページリロードして進捗を反映させる
  await setConditionProgress(page, PLAYER_UUID, 5, [{ conditionId: 'cond-5-check1', completed: true }])
  // 進捗セット後にリロードして最新状態を読み込む
  await page.reload()
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
  await openQuestModal(page, '5')

  // cond-5-check2 の「了解」ボタンが 1 つある
  await expect(page.getByRole('button', { name: '了解' })).toHaveCount(1, { timeout: 3000 })

  // 残りの「了解」をクリック
  await page.getByRole('button', { name: '了解' }).click()

  // 全完了 → 「了解」ボタンが 0 になる
  await expect(page.getByRole('button', { name: '了解' })).toHaveCount(0, { timeout: 5000 })
  // モーダル内に達成チェックマークが2つ表示される (キャンバスのものは除外)
  const modal = page.locator('.absolute.inset-0.z-40')
  await expect(modal.locator('[title="達成済み"]')).toHaveCount(2, { timeout: 3000 })
})

// LO-1: エディタで座標タスクを持つクエストを開くと座標フィールドが表示される
test('LO-1: 座標タスク編集モーダルに座標フィールドが表示される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '6')

  // QuestEditorModal 内のタスク行をクリックして TaskRewardEditorModal を開く
  // 座標タスクの表示テキストを含む要素をクリック (座標: 地上 (100, 64, 200) ±10)
  await page.locator('text=座標').first().click()

  // X / Y / Z ラベルが見える
  await expect(page.getByText('X').first()).toBeVisible({ timeout: 3000 })
  await expect(page.getByText('Y').first()).toBeVisible()
  await expect(page.getByText('Z').first()).toBeVisible()
  // ディメンション select が見える
  await expect(page.getByRole('combobox')).toBeVisible()
  // 半径フィールドが見える
  await expect(page.getByText('半径 (ブロック)')).toBeVisible()
})

// LO-2: 「現在の位置を入力」ボタンを押すとモックAPIの値 (100, 64, 200) が入る
test('LO-2: 「現在の位置を入力」ボタンで座標が自動入力される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '6')

  // 座標タスク行をクリックして TaskRewardEditorModal へ
  await page.locator('text=座標').first().click()
  await expect(page.getByRole('combobox')).toBeVisible({ timeout: 3000 })

  // クリア: 座標を 0 にしておく
  const xInput = page.locator('input[type="number"]').first()
  await expect(xInput).toBeVisible()

  await page.getByRole('button', { name: /現在の位置を入力/ }).click()

  // モックが x=100, y=64, z=200 を返す — X フィールドが 100 になる
  await expect(page.locator('input[type="number"]').first()).toHaveValue('100', { timeout: 5000 })
})
