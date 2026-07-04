/**
 * 提案 (proposal) のラウンドトリップ退化回帰テスト
 *
 * かつて proposalToNode が point 報酬と stat タスクの分岐を持たず、
 * 提案を送信して再読込した直後に ポイント=0 / 統計=未設定 に化けし、
 * 再編集して再送信するとその値で上書きされてデータが消失していた。
 *
 * 確認内容:
 *  RP-1: ポイント報酬付き提案を送信 → 再読込後も "ポイント: <amount> pt" が保持される (0 pt にならない)
 *  RP-2: 統計タスク付き提案を送信 → 再読込後も 統計の明細が保持される (未設定 にならない)
 *  RP-3: 編集者が提案を移動して再送信 → API snapshot の point amount / stat 条件が消失しない
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs, loggedInBtn, resetProposals, MOCK, resetAll } from './helpers.js'

const PROP_TITLE = `ラウンドトリップ検証_${Date.now()}`

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await resetProposals(page)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

/** 既存提案ノードを開いてモーダルを表示 */
async function openExistingProposal(page: Page) {
  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(1, { timeout: 5000 })
  const node = page.locator('[data-node-id^="existing-proposal-"]').first()
  const box = await node.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 5000 })
}

/** ポイント報酬 + 統計タスク を含む提案を API 経由で seeding する */
async function seedProposal(page: Page) {
  const res = await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-player-token' } })
  expect(res.ok()).toBeTruthy()
  const create = await page.request.post(`${MOCK}/api/proposals`, {
    headers: { Authorization: 'Bearer demo-player-token' },
    data: {
      title: PROP_TITLE,
      status: 'proposed',
      icon: 'stone',
      prerequisites: [],
      conditions: [{
        id: 'cond-stat',
        type: 'stat',
        statType: 'minecraft:mined',
        statId: 'minecraft:stone',
        count: 3,
      }],
      rewards: [{ type: 'point', amount: 77 }],
      mapPosition: { x: 500, y: 300 },
      category: null,
      customButtons: [],
    },
  })
  expect(create.status()).toBe(201)
}

// RP-1 + RP-2
test('提案のポイント報酬と統計タスクが再読込後も欠損しない', async ({ page }) => {
  await seedProposal(page)

  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await expect(page.getByText(/提案モード/)).toBeVisible()

  await openExistingProposal(page)

  // ポイント報酬: 77 pt が保持されている (退化時は 0 pt になる)
  await expect(page.getByText(/ポイント:.*77 pt/)).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/ポイント:.*0 pt/)).toHaveCount(0)

  // 統計タスク: 採掘カテゴリと目標値 ×3 が保持されている (退化時は 未設定 になる)
  await expect(page.getByText(/統計: 採掘.*×3/)).toBeVisible({ timeout: 5000 })
  await expect(page.locator('text=統計: 未設定')).toHaveCount(0)

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// RP-3
test('編集者が提案を移動して再送信してもポイント/統計が消失しない', async ({ page }) => {
  await seedProposal(page)

  await loginAs(page, 'demo-editor-token')
  await page.getByText('クエスト追加を提案する').click()
  await expect(page.getByText(/提案モード/)).toBeVisible()

  const proposalNode = page.locator('[data-node-id^="existing-proposal-"]').first()
  await expect(proposalNode).toBeVisible({ timeout: 8000 })

  // 提案ノードをドラッグ移動 → myProposalEdits に載る
  const before = await proposalNode.boundingBox()
  const cx = before!.x + before!.width / 2
  const cy = before!.y + before!.height / 2
  await page.getByTitle('移動').click()
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 100, cy + 80, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  // 再送信 (nodeToApiBody 経由で PUT /api/quests/:questId)
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 3000 })
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  // API snapshot に point amount / stat 条件が残っていること
  const res = await page.request.get(`${MOCK}/api/proposals`, {
    headers: { Authorization: 'Bearer demo-editor-token' },
  })
  const proposals = await res.json()
  const ours = proposals.find((p: any) => p.questSnapshot?.title === PROP_TITLE)
  expect(ours, 'seed した提案が見つからない').toBeTruthy()

  const point = ours.questSnapshot.rewards.find((r: any) => r.type === 'point')
  expect(point, 'ポイント報酬が消失した').toBeTruthy()
  expect(point.amount).toBe(77)

  const stat = ours.questSnapshot.conditions.find((c: any) => c.type === 'stat')
  expect(stat, '統計タスクが消失した').toBeTruthy()
  expect(stat.statType).toBe('minecraft:mined')
  expect(stat.statId).toBe('minecraft:stone')
  expect(stat.count).toBe(3)
})
