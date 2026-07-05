import { expect, type Page } from '@playwright/test'

const MOCK_PORT = process.env.MOCK_PORT ?? '3001'
export const MOCK = `http://localhost:${MOCK_PORT}`

export const EDITOR_UUID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
export const PLAYER_UUID = 'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa'

export const loggedInBtn  = (page: Page) => page.locator('button[title*="クリックでログアウト"]')
export const loggedOutBtn = (page: Page) => page.locator('button[title="ログイン"]')

/** /api/auth/quick でセッションをupsertしてからトークンを注入してリロード */
export async function loginAs(page: Page, token: 'demo-editor-token' | 'demo-player-token') {
  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token } })
  await page.evaluate((t) => localStorage.setItem('token', t), token)
  await page.reload()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  if (token === 'demo-editor-token') {
    await page.getByTitle('編集モード').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTitle('編集モード').click()
  }
}

/** ノード要素を data-node-id で取得してクリックし、クエストモーダルを開く */
export async function openQuestModal(page: Page, nodeId: string) {
  const node = page.locator(`[data-node-id="${nodeId}"]`)
  await expect(node).toBeVisible({ timeout: 5000 })
  const box = await node.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
}

/** テスト用: 指定プレイヤー・クエストの進捗をリセット */
export async function resetProgress(page: Page) {
  await page.request.post(`${MOCK}/api/test/reset-progress`)
}

/** テスト用: DB全体を seed 状態に戻す (quests/sessions/progress/completions/rewards/proposals/comments 全部)
 *  各 spec の beforeEach で呼ぶことでテスト間の状態漏れを防ぐ Fixture 役 */
export async function resetAll(page: Page) {
  await page.request.post(`${MOCK}/api/test/reset-all`)
}

/** テスト用: 提案・proposed クエストをすべて削除 */
export async function resetProposals(page: Page) {
  await page.request.post(`${MOCK}/api/test/reset-proposals`)
}

/** テスト用: クエスト完了状態をセット (progress配列なし) */
export async function setProgress(
  page: Page,
  playerUuid: string,
  questId: number,
  opts: { completed: boolean; rewardClaimed?: boolean },
) {
  await page.request.post(`${MOCK}/api/test/set-progress`, {
    data: { playerUuid, questId, ...opts },
  })
}

/** テスト用: 条件単位の進捗をセット */
export async function setConditionProgress(
  page: Page,
  playerUuid: string,
  questId: number,
  progress: object[],
  opts: { completed?: boolean; rewardClaimed?: boolean } = {},
) {
  await page.request.post(`${MOCK}/api/test/set-condition-progress`, {
    data: { playerUuid, questId, progress, ...opts },
  })
}

/** テスト用: quest_complete SSE を発火 */
export async function notifyQuestComplete(
  page: Page,
  token: string,
  questId: number,
  questTitle: string,
  playerName = 'Editor',
) {
  await page.request.post(`${MOCK}/api/test/notify-quest-complete`, {
    data: { token, questId, questTitle, playerName },
  })
}

/** テスト用: progress_update SSE を発火 */
export async function notifyProgressUpdate(
  page: Page,
  token: string,
  questId: number,
  completed: boolean,
) {
  await page.request.post(`${MOCK}/api/test/notify-progress-update`, {
    data: { token, questId, completed },
  })
}

/** クエストタイトルからクエストIDを取得（API経由） */
export async function getFirstQuestId(page: Page, title: string): Promise<number> {
  const response = await page.request.get(`${MOCK}/api/quests`)
  const quests = await response.json()
  const quest = quests.find((q: any) => q.title === title)
  if (!quest) throw new Error(`クエスト "${title}" が見つかりません`)
  return quest.id
}
