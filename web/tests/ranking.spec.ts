/**
 * ランキング機能テスト
 * RK-1. モーダルに「ランキング」セクションが表示され、クリア順ランキングが出る
 * RK-2. 上位N位が順位付きで表示される (🥇🥈🥉 含む)
 * RK-3. 自分が圏外のとき、区切り線付きで自分の周辺順位 (isMeハイライト) が出る
 * RK-4. 繰り返しクエストで「クリア回数」セグメントが出て回数降順で並ぶ
 * RK-5. 非繰り返しクエストでは回数セグメントが出ない
 * RK-6. 「全ランキングを見る」で全件表示に切り替わる
 */

import { test, expect } from '@playwright/test'
import { loginAs, openQuestModal, PLAYER_UUID, MOCK } from './helpers.js'

// クリアログを投入する
async function addCompletions(
  page: import('@playwright/test').Page,
  questId: number,
  entries: Array<{ playerUuid: string; playerName: string; completedAt: string }>,
) {
  await page.request.post(`${MOCK}/api/test/add-completion`, { data: { questId, entries } })
}

async function resetCompletions(page: import('@playwright/test').Page) {
  await page.request.post(`${MOCK}/api/test/reset-completions`)
}

// quest の repeat 設定を変更する (テスト間で状態が漏れるため明示設定)
async function setRepeat(
  page: import('@playwright/test').Page,
  questId: number,
  repeat: { type: string } | null,
) {
  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-editor-token' } })
  await page.request.put(`${MOCK}/api/quests/${questId}`, {
    headers: { Authorization: 'Bearer demo-editor-token' },
    data: { repeat },
  })
}

// 上位プレイヤー6人分のクリアログ (クリア順)
function topSix(questId: number) {
  return [
    { playerUuid: 'p1', playerName: 'Notch',      completedAt: '2026-06-19T09:01:00' },
    { playerUuid: 'p2', playerName: 'jeb_',       completedAt: '2026-06-19T09:14:00' },
    { playerUuid: 'p3', playerName: 'Dinnerbone', completedAt: '2026-06-19T10:02:00' },
    { playerUuid: 'p4', playerName: 'kamesuta',   completedAt: '2026-06-19T11:30:00' },
    { playerUuid: 'p5', playerName: 'Steve',      completedAt: '2026-06-19T12:45:00' },
    { playerUuid: 'p6', playerName: 'Herobrine',  completedAt: '2026-06-20T08:10:00' },
  ]
}

test.beforeEach(async ({ page }) => {
  await resetCompletions(page)
  // 既定では quest 1 を非繰り返しに戻す (RK-4 だけが繰り返しに設定する)
  await setRepeat(page, 1, null)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

test('RK-1: モーダルにランキングセクションが表示される', async ({ page }) => {
  await addCompletions(page, 1, topSix(1))
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  // 「ランキング」見出しと「クリア順ランキング」ラベル
  await expect(page.getByText('ランキング', { exact: true })).toBeVisible()
  await expect(page.getByText(/クリア順ランキング/)).toBeVisible()
  // プレイヤー名が出る
  await expect(page.getByText('Notch')).toBeVisible()
})

test('RK-2: 上位が順位付き(メダル含む)で表示される', async ({ page }) => {
  await addCompletions(page, 1, topSix(1))
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  // 1位はメダル、4位以降は #4 表記
  await expect(page.getByText('🥇')).toBeVisible()
  await expect(page.getByText('🥈')).toBeVisible()
  await expect(page.getByText('🥉')).toBeVisible()
  await expect(page.getByText('#4')).toBeVisible()
  // 6人クリア表記
  await expect(page.getByText('6人がクリア')).toBeVisible()
})

test('RK-3: 自分が圏外のとき周辺順位がisMeハイライトで出る', async ({ page }) => {
  // limit=10 なので、自分(Alex=PLAYER_UUID)を15位相当にするため14人 + 自分を入れる
  const many = Array.from({ length: 14 }, (_, i) => ({
    playerUuid: `bot${i}`,
    playerName: `Bot${i}`,
    completedAt: `2026-06-19T0${(i % 9) + 1}:00:00`,
  }))
  // 自分は一番遅いクリア時刻 → 最下位 (15位)
  many.push({ playerUuid: PLAYER_UUID, playerName: 'Alex', completedAt: '2026-06-30T23:59:00' })
  await addCompletions(page, 1, many)

  await loginAs(page, 'demo-player-token')
  await openQuestModal(page, '1')

  // 区切り線(⋯)と自分の行
  await expect(page.getByText('⋯')).toBeVisible()
  await expect(page.getByText('(あなた)')).toBeVisible()
  // 15位
  await expect(page.getByText('#15')).toBeVisible()
})

test('RK-4: 繰り返しクエストでクリア回数セグメントが出て回数降順', async ({ page }) => {
  // quest 1 を繰り返しに設定
  await setRepeat(page, 1, { type: 'unlimited' })
  // Dinnerbone=3回, Notch=2回, Steve=1回
  await addCompletions(page, 1, [
    { playerUuid: 'd', playerName: 'Dinnerbone', completedAt: '2026-06-19T10:00:00' },
    { playerUuid: 'd', playerName: 'Dinnerbone', completedAt: '2026-06-19T11:00:00' },
    { playerUuid: 'd', playerName: 'Dinnerbone', completedAt: '2026-06-19T12:00:00' },
    { playerUuid: 'n', playerName: 'Notch', completedAt: '2026-06-19T09:00:00' },
    { playerUuid: 'n', playerName: 'Notch', completedAt: '2026-06-19T13:00:00' },
    { playerUuid: 's', playerName: 'Steve', completedAt: '2026-06-19T08:00:00' },
  ])

  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  // クリア回数セグメントをクリック
  await page.getByRole('button', { name: 'クリア回数' }).click()

  // 回数表記 (3回) が出て、1位が Dinnerbone
  await expect(page.getByText('3', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Dinnerbone')).toBeVisible()
  // 回数の単位「回」が表示される
  await expect(page.getByText('回', { exact: true }).first()).toBeVisible()
})

test('RK-5: 非繰り返しクエストでは回数セグメントが出ない', async ({ page }) => {
  // beforeEach で quest 1 は非繰り返しに戻っている
  await addCompletions(page, 1, topSix(1))
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  // クリア回数セグメントボタンが存在しない
  await expect(page.getByRole('button', { name: 'クリア回数' })).toHaveCount(0)
})

test('RK-6: 全ランキングを見るで全件表示に切り替わる', async ({ page }) => {
  // 12人クリア (limit=10 を超える) → 詳細ボタンが出る
  const many = Array.from({ length: 12 }, (_, i) => ({
    playerUuid: `q${i}`,
    playerName: `Player${i}`,
    completedAt: `2026-06-19T0${(i % 9) + 1}:00:00`,
  }))
  await addCompletions(page, 1, many)
  await loginAs(page, 'demo-editor-token')
  await openQuestModal(page, '1')

  // 初期は上位10位 → #11 は見えない
  await expect(page.getByText('#11')).toHaveCount(0)
  // 全ランキングを見る
  await page.getByRole('button', { name: '全ランキングを見る' }).click()
  // 全件表示 → #11, #12 が出る
  await expect(page.getByText('#11')).toBeVisible()
  await expect(page.getByText('#12')).toBeVisible()
})

test('RK-9: 自分が圏外のとき「全ランキングを見る」ボタンが押せる', async ({ page }) => {
  // 自分(Alex)を limit=5 圏外 (8位) にする
  const many = Array.from({ length: 7 }, (_, i) => ({
    playerUuid: `bot${i}`,
    playerName: `Bot${i}`,
    completedAt: `2026-06-19T0${i + 1}:00:00`,
  }))
  many.push({ playerUuid: PLAYER_UUID, playerName: 'Alex', completedAt: '2026-06-30T23:59:00' })
  await addCompletions(page, 1, many)

  await loginAs(page, 'demo-player-token')
  await openQuestModal(page, '1')

  // around があっても「全ランキングを見る」ボタンが見えて押せる
  await expect(page.getByText('⋯')).toBeVisible()
  const btn = page.getByRole('button', { name: '全ランキングを見る' })
  await expect(btn).toBeVisible()
  await btn.click()
  // 全件表示になりボタンが消える
  await expect(btn).toHaveCount(0)
  await expect(page.getByText('#8')).toBeVisible()
})

test('RK-8: 既存の完了済み進捗がランキングへ移行される', async ({ page }) => {
  await setRepeat(page, 1, null)
  // クリアログは空。既存進捗 (player_progress) だけを完了状態にする
  await page.request.post(`${MOCK}/api/test/set-progress`, {
    data: { playerUuid: PLAYER_UUID, questId: 1, completed: true },
  })
  // 移行を実行
  await page.request.post(`${MOCK}/api/test/migrate-completions`)

  await loginAs(page, 'demo-player-token')
  await openQuestModal(page, '1')

  // 移行された自分 (Alex) がランキングに出る
  await expect(page.getByText(/クリア順ランキング/)).toBeVisible()
  await expect(page.getByText('(あなた)')).toBeVisible()
})
