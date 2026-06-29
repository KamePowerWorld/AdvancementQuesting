/**
 * view-as (他プレイヤーの攻略覗き見) 機能テスト
 * VA-1. ランキングの他人の名前クリックで view-as 開始・閲覧バナーが出る
 * VA-2. view-as 中はその人の進捗 (達成済みノード) でマップが描画される
 * VA-3. view-as 中は操作系UI (claim 等) が出ない (読み取り専用)
 * VA-4. 「自分に戻る」で自分視点に戻る
 * VA-5. ?viewAs=<uuid> 直リンク/リロードで視点が復元される
 * VA-6. 自分の行 (isMe) クリックでは view-as に入らない
 */

import { test, expect } from '@playwright/test'
import { loginAs, openQuestModal, setProgress, resetProgress, PLAYER_UUID, MOCK, resetAll } from './helpers.js'

const OTHER_UUID = 'dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb'
const OTHER_NAME = 'Notch'

async function addCompletions(
  page: import('@playwright/test').Page,
  questId: number,
  entries: Array<{ playerUuid: string; playerName: string; completedAt: string }>,
) {
  await page.request.post(`${MOCK}/api/test/add-completion`, { data: { questId, entries } })
}

async function addRewardClaim(
  page: import('@playwright/test').Page,
  data: { questId: number; questTitle: string; playerUuid: string; playerName: string; rewards: object[]; source?: string },
) {
  await page.request.post(`${MOCK}/api/test/add-reward-claim`, { data })
}

test.beforeEach(async ({ page }) => {
  // resetAll で quests/sessions/progress/completions/rewards 全部を seed 状態に戻す
  await resetAll(page)
  // 他プレイヤー Notch をランキングに載せ、quest 1,2 をクリア済みにする
  await addCompletions(page, 1, [
    { playerUuid: OTHER_UUID, playerName: OTHER_NAME, completedAt: '2026-06-19T09:00:00' },
  ])
  await setProgress(page, OTHER_UUID, 1, { completed: true, rewardClaimed: true })
  await setProgress(page, OTHER_UUID, 2, { completed: true, rewardClaimed: true })
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

test('VA-1: ランキングの他人の名前クリックで view-as 開始・バナー表示', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await openQuestModal(page, '1')

  // ランキングの Notch をクリック
  await page.getByText(OTHER_NAME).click()

  // 閲覧バナーが出る
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible()
  // URL に viewAs が載る
  await expect(page).toHaveURL(new RegExp(`viewAs=${OTHER_UUID}`))
})

test('VA-2: view-as 中はその人の進捗で達成済みノードが描画される', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  // 自分 (Alex) は何もクリアしていない
  await page.goto(`/?viewAs=${OTHER_UUID}&viewAsName=${OTHER_NAME}`)
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })

  // Notch が完了した quest 1 のノードが達成済み (金枠 ✓) になる
  const node1 = page.locator('[data-node-id="1"]')
  await expect(node1).toBeVisible()
  await expect(node1.getByText('✓')).toBeVisible()
})

test('VA-3: view-as 中は報酬受取ボタンが出ない (読み取り専用)', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.goto(`/?viewAs=${OTHER_UUID}&viewAsName=${OTHER_NAME}`)
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })

  await openQuestModal(page, '1')
  // 報酬受取ボタンが出ない (他人の完了済みクエストでも操作不可)
  await expect(page.getByRole('button', { name: /報酬を受け取る/ })).toHaveCount(0)
})

test('VA-4: 「自分に戻る」で自分視点に戻る', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.goto(`/?viewAs=${OTHER_UUID}&viewAsName=${OTHER_NAME}`)
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: '自分に戻る' }).click()

  // バナーが消える
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toHaveCount(0)
  await expect(page).not.toHaveURL(/viewAs=/)
})

test('VA-5: ?viewAs 直リンク/リロードで視点が復元される', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.goto(`/?viewAs=${OTHER_UUID}&viewAsName=${OTHER_NAME}`)
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })

  await page.reload()
  // リロード後も復元される
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })
})

test('VA-7: 最近のアクティビティにクリアが新しい順で並ぶ・行クリックでモーダルが開く', async ({ page }) => {
  // Notch のクリアログを quest 2(古い), quest 1(新しい) で投入
  await addCompletions(page, 2, [
    { playerUuid: OTHER_UUID, playerName: OTHER_NAME, completedAt: '2026-06-18T09:00:00' },
  ])
  await loginAs(page, 'demo-player-token')
  await page.goto(`/?viewAs=${OTHER_UUID}&viewAsName=${OTHER_NAME}`)
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })

  // アクティビティパネル
  const panel = page.getByTestId('viewas-panel')
  await expect(panel).toBeVisible()
  // クエストタイトルが出る (seed: quest1=基本)
  await expect(panel.getByText('基本')).toBeVisible()

  // 行クリックでクエストモーダルが開く
  await panel.getByText('基本').click()
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
})

test('VA-8: アクティビティが下端スクロールで追加読み込みされる (無限スクロール)', async ({ page }) => {
  // limit=20 を超える 25件のクリアログを投入 (quest 1 を繰り返しクリアした想定)
  const many = Array.from({ length: 25 }, (_, i) => ({
    playerUuid: OTHER_UUID,
    playerName: OTHER_NAME,
    completedAt: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T09:00:00`,
  }))
  await addCompletions(page, 1, many)

  await loginAs(page, 'demo-player-token')
  await page.goto(`/?viewAs=${OTHER_UUID}&viewAsName=${OTHER_NAME}`)
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })

  const panel = page.getByTestId('viewas-panel')
  const scroller = panel.locator('div.overflow-y-auto')
  // 初期は20件。番兵まで到達するため最下部までスクロール
  await expect(panel.getByText('基本').first()).toBeVisible()
  // 末尾まで複数回スクロールして全件読み込み → 「これ以上ありません」
  for (let i = 0; i < 8; i++) {
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(400)
  }
  await expect(panel.getByText('これ以上ありません')).toBeVisible({ timeout: 5000 })
})

test('VA-6: 自分の行 (isMe) クリックでは view-as に入らない', async ({ page }) => {
  // 自分 (Alex=PLAYER_UUID) もランキングに載せる
  await addCompletions(page, 1, [
    { playerUuid: PLAYER_UUID, playerName: 'Alex', completedAt: '2026-06-20T09:00:00' },
  ])
  await loginAs(page, 'demo-player-token')
  await openQuestModal(page, '1')

  // 自分の行 (あなた) をクリックしても view-as に入らない
  await page.getByText('(あなた)').click()
  await expect(page.getByText('の攻略を見ています')).toHaveCount(0)
})

test('VA-9: 獲得報酬タブにスカラーチップとアイテムグリッドが出て内訳クリックでクエストへ辿れる (デスクトップ: ポップオーバーがパネル外に展開)', async ({ page }) => {
  // Notch の報酬受取ログを投入 (quest 1 で point+item)
  await addRewardClaim(page, {
    questId: 1, questTitle: '基本', playerUuid: OTHER_UUID, playerName: OTHER_NAME,
    rewards: [
      { type: 'point', label: '達成ポイント', amount: 100 },
      { type: 'item', label: '木のツルハシ', itemType: 'wooden_pickaxe', count: 1 },
    ],
  })
  await loginAs(page, 'demo-player-token')
  await page.goto(`/?viewAs=${OTHER_UUID}&viewAsName=${OTHER_NAME}`)
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })

  const panel = page.getByTestId('viewas-panel')
  await panel.getByRole('button', { name: '獲得報酬' }).click()

  // ポイントスカラーチップ (100pt) が出る
  await expect(panel.getByText('100').first()).toBeVisible()

  // ポイントチップをクリック → 内訳ポップオーバーが出る
  await panel.locator('button[title*="ポイント"]').click()
  const popover = page.getByTestId('reward-popover')
  await expect(popover).toBeVisible({ timeout: 2000 })
  await expect(popover.getByText('達成ポイント')).toBeVisible()

  // ポップオーバーがパネルの外 (document.body 直下 Portal) に展開されていることを確認:
  const panelBox = await panel.boundingBox()
  const popoverBox = await popover.boundingBox()
  expect(panelBox).not.toBeNull()
  expect(popoverBox).not.toBeNull()
  // ポップオーバーの上端がパネル上端より下 (= overflow外に出ている)
  expect(popoverBox!.y).toBeGreaterThan(panelBox!.y)
  // ポップオーバーがビューポート右端にはみ出していない
  const vw = page.viewportSize()!.width
  expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(vw)

  // 内訳の行クリックでクエストモーダルが開く
  await popover.getByText('達成ポイント').click()
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
})

test('VA-10: 右端アイテムの内訳ポップオーバーがビューポートからはみ出ない', async ({ page }) => {
  // 多数のアイテム報酬を投入してグリッドが右端まで埋まるようにする
  const manyItems = Array.from({ length: 8 }, (_, i) => ({
    type: 'item', label: `item${i}`, itemType: `stone`, count: i + 1,
  }))
  // 複数クエスト分投入して明細を作る (重複itemTypeは集計される)
  for (let i = 0; i < 8; i++) {
    await addRewardClaim(page, {
      questId: i % 2 === 0 ? 1 : 2,
      questTitle: i % 2 === 0 ? '基本' : '応用',
      playerUuid: OTHER_UUID, playerName: OTHER_NAME,
      rewards: [{ type: 'item', label: `ツール${i}`, itemType: `wooden_pickaxe`, count: i + 1 }],
    })
  }
  await loginAs(page, 'demo-player-token')
  await page.goto(`/?viewAs=${OTHER_UUID}&viewAsName=${OTHER_NAME}`)
  await expect(page.getByText(`${OTHER_NAME} の攻略を見ています`)).toBeVisible({ timeout: 10000 })

  const panel = page.getByTestId('viewas-panel')
  await panel.getByRole('button', { name: '獲得報酬' }).click()

  // アイテムグリッドのボタン (40x40px の正方形) を取得してクリック
  // タブボタンを除外するため w-10 h-10 クラスのボタンを狙う
  const itemBtns = panel.locator('button.w-10.h-10')
  await expect(itemBtns.first()).toBeVisible({ timeout: 3000 })
  const count = await itemBtns.count()
  expect(count).toBeGreaterThan(0)
  await itemBtns.last().click()

  const popover = page.getByTestId('reward-popover')
  await expect(popover).toBeVisible({ timeout: 2000 })

  // ポップオーバーがビューポート右端にはみ出ていない
  const vw = page.viewportSize()!.width
  const box = await popover.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
})

test('VA-MIG-1: クリア済み&受取済み進捗が報酬ログへ移行される', async ({ page }) => {
  // quest 1 を完了&受取済みにして移行を実行
  await setProgress(page, OTHER_UUID, 1, { completed: true, rewardClaimed: true })
  await page.request.post(`${MOCK}/api/test/migrate-rewards`)

  // API を直接確認: items が存在する
  const resp = await page.request.get(`${MOCK}/api/players/${OTHER_UUID}/rewards`)
  const body = await resp.json()
  expect(body.items.length).toBeGreaterThan(0)
})

test('VA-MIG-2: 未受取(reward_claimed=0)は移行されない', async ({ page }) => {
  // beforeEach の進捗をクリアして、quest 1 を「完了したが未受取」だけにする
  await page.request.post(`${MOCK}/api/test/reset-progress`)
  await setProgress(page, OTHER_UUID, 1, { completed: true, rewardClaimed: false })
  await page.request.post(`${MOCK}/api/test/migrate-rewards`)

  // API を直接確認: items が空
  const resp = await page.request.get(`${MOCK}/api/players/${OTHER_UUID}/rewards`)
  const body = await resp.json()
  expect(body.items.length).toBe(0)
})

test('VA-MIG-3: 移行を2回実行しても二重に積まれない (冪等)', async ({ page }) => {
  await setProgress(page, OTHER_UUID, 1, { completed: true, rewardClaimed: true })
  await page.request.post(`${MOCK}/api/test/migrate-rewards`)
  const first = await (await page.request.get(`${MOCK}/api/players/${OTHER_UUID}/rewards`)).json()
  await page.request.post(`${MOCK}/api/test/migrate-rewards`)
  const second = await (await page.request.get(`${MOCK}/api/players/${OTHER_UUID}/rewards`)).json()
  expect(second.items.length).toBe(first.items.length)
})

test('C3: 報酬受取後に🎁バッジがマップから消える', async ({ page }) => {
  await resetProgress(page)
  // quest 1 を完了済み・未受取状態にセット
  await setProgress(page, PLAYER_UUID, 1, { completed: true, rewardClaimed: false })
  await loginAs(page, 'demo-player-token')

  // マップに🎁バッジが表示されること
  const node1 = page.locator('[data-node-id="1"]')
  await expect(node1).toBeVisible({ timeout: 5000 })
  const badge = node1.locator('[title="報酬を受け取れます"]')
  await expect(badge).toBeVisible({ timeout: 5000 })

  // モーダルを開いて「報酬を受け取る」ボタンをクリック
  await openQuestModal(page, '1')
  await expect(page.getByText('★ 報酬を受け取る')).toBeVisible({ timeout: 3000 })
  await page.getByText('★ 報酬を受け取る').click()

  // ボタンが消えるのを待つ (API完了・queryClient更新後)
  await expect(page.getByText('★ 報酬を受け取る')).not.toBeVisible({ timeout: 5000 })

  // モーダルを閉じて🎁バッジがマップから消えることを確認
  await page.getByRole('button', { name: '閉じる' }).last().click()
  await expect(badge).not.toBeVisible({ timeout: 5000 })
})
