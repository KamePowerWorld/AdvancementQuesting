/**
 * コメントブロック機能テスト
 * C-1. 編集者: add_comment モードでドラッグするとコメントブロックが生成される
 * C-2. コメントブロック: タイトルをダブルクリックでインライン編集できる
 * C-3. コメントブロック: カラーボタンで色変更できる
 * C-4. コメントブロック: delete モードでクリックすると削除される
 * C-5. コメントブロック: リロード後も永続化される
 * C-6. コメントブロック: 未ログインでは add_comment ボタンが表示されない
 * C-7. コメントブロック: 枠をドラッグすると内包クエストもまとめて動く
 * C-8. コメントブロック: 枠外のクエストはドラッグの影響を受けない
 * C-9. コメントブロック: タイトルを複数行で入力・保持できる
 * C-10. コメントブロック: プレイモードでは編集できない (ドラッグで動かない)
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, MOCK, resetAll } from './helpers.js'

/** ノードの style から world 座標 (left/top) を取り出す */
async function nodePos(page: Page, nodeId: string): Promise<{ left: number; top: number }> {
  const style = (await page.locator(`[data-node-id="${nodeId}"]`).getAttribute('style')) ?? ''
  const left = parseFloat(/left:\s*([\d.-]+)px/.exec(style)?.[1] ?? 'NaN')
  const top = parseFloat(/top:\s*([\d.-]+)px/.exec(style)?.[1] ?? 'NaN')
  return { left, top }
}

/** ノード1を内包するコメントを作成する (ヘッダー帯はノードの上に来るよう開始点を上方に取る) */
async function createCommentOverNode1(page: Page) {
  const node1 = page.locator('[data-node-id="1"]')
  await expect(node1).toBeVisible({ timeout: 5000 })
  const nb = await node1.boundingBox()
  const cx = nb!.x + nb!.width / 2
  const cy = nb!.y + nb!.height / 2

  await page.getByTitle('コメントを追加').click()
  // ノード中心を囲む矩形。開始点を中心より上方(-60)に取り、ヘッダー帯がノードに被らないようにする
  await page.mouse.move(cx - 70, cy - 60)
  await page.mouse.down()
  await page.mouse.move(cx + 80, cy + 80, { steps: 10 })
  await page.mouse.up()
  await expect(page.locator('[data-comment-id]')).toBeVisible({ timeout: 3000 })
}

test.beforeEach(async ({ page }) => {
  // コメントは in-memory なので resetAll の後に個別にリセット
  await resetAll(page)
  await page.request.post(`${MOCK}/api/test/reset-comments`)
  await page.goto('/')
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// C-1
test('編集者: add_commentモードでドラッグするとコメントブロックが生成される (C-1)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  await page.getByTitle('コメントを追加').click()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const box = await canvas.boundingBox()

  // ドラッグで矩形を描く (右下の空きエリア)
  const sx = box!.x + box!.width - 350
  const sy = box!.y + box!.height - 250
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 200, sy + 120, { steps: 10 })
  await page.mouse.up()

  // コメントブロックが生成されること
  await expect(page.locator('[data-comment-id]')).toBeVisible({ timeout: 3000 })
  await expect(page.locator('[data-comment-id]')).toContainText('コメント')
})

// C-2
test('コメントブロック: タイトルをダブルクリックでインライン編集できる (C-2)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // コメントを作成 (右下の空きエリア)
  await page.getByTitle('コメントを追加').click()
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const box = await canvas.boundingBox()
  const sx = box!.x + box!.width - 350
  const sy = box!.y + box!.height - 250
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 200, sy + 120, { steps: 10 })
  await page.mouse.up()

  await expect(page.locator('[data-comment-id]')).toBeVisible({ timeout: 3000 })

  // コメントブロックのヘッダーを座標で直接ダブルクリック (ノードの裏に隠れないよう座標を使う)
  const commentBox = await page.locator('[data-comment-id]').first().boundingBox()
  // ヘッダーは上部 28px なのでその中央をダブルクリック
  await page.mouse.dblclick(commentBox!.x + commentBox!.width / 2, commentBox!.y + 14)

  // textarea が表示されること
  const input = page.locator('[data-comment-id] textarea')
  await expect(input).toBeVisible({ timeout: 2000 })
  await input.fill('テストコメント')
  await input.press('Control+Enter') // Ctrl+Enter で確定

  // タイトルが更新されること
  await expect(page.locator('[data-comment-id]')).toContainText('テストコメント')
})

// C-4
test('コメントブロック: deleteモードでクリックすると削除される (C-4)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // コメントを作成 (右下の空きエリア)
  await page.getByTitle('コメントを追加').click()
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const box = await canvas.boundingBox()
  const sx = box!.x + box!.width - 350
  const sy = box!.y + box!.height - 250
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 200, sy + 120, { steps: 10 })
  await page.mouse.up()

  await expect(page.locator('[data-comment-id]')).toBeVisible({ timeout: 3000 })

  // 削除モードに切り替えてコメントをクリック
  await page.getByTitle('削除').click()
  const comment = page.locator('[data-comment-id]').first()
  const commentBox = await comment.boundingBox()
  await page.mouse.click(commentBox!.x + commentBox!.width / 2, commentBox!.y + commentBox!.height / 2)

  // コメントブロックが消えること
  await expect(page.locator('[data-comment-id]')).not.toBeVisible({ timeout: 3000 })
})

// C-5
test('コメントブロック: リロード後も永続化される (C-5)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // コメントを作成 (右下の空きエリア)
  await page.getByTitle('コメントを追加').click()
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const box = await canvas.boundingBox()
  const sx = box!.x + box!.width - 350
  const sy = box!.y + box!.height - 250
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 200, sy + 120, { steps: 10 })
  await page.mouse.up()

  await expect(page.locator('[data-comment-id]')).toBeVisible({ timeout: 3000 })

  // ページをリロード
  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-editor-token' } })
  await page.reload()
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })

  // コメントブロックが残っていること
  await expect(page.locator('[data-comment-id]')).toBeVisible({ timeout: 3000 })
})

// C-6
test('コメントブロック: 未ログイン時はコメント追加ボタンが非表示 (C-6)', async ({ page }) => {
  // 未ログイン状態ではコメント追加ボタンが見えないこと
  await expect(page.getByTitle('コメントを追加')).not.toBeVisible()
})

// C-7
test('コメントブロック: 枠をドラッグすると内包クエストもまとめて動く (C-7)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await createCommentOverNode1(page)

  const before = await nodePos(page, '1')

  // 選択モードに切り替えてコメントヘッダーをドラッグ
  await page.getByTitle('選択').click()
  const cbox = await page.locator('[data-comment-id]').first().boundingBox()
  const hx = cbox!.x + cbox!.width / 2
  const hy = cbox!.y + 14 // ヘッダー帯の中央
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(hx + 100, hy + 50, { steps: 12 })
  await page.mouse.up()

  // 内包ノードが同方向に移動していること (誤差許容)
  const after = await nodePos(page, '1')
  expect(after.left - before.left).toBeGreaterThan(80)
  expect(after.left - before.left).toBeLessThan(120)
  expect(after.top - before.top).toBeGreaterThan(30)
  expect(after.top - before.top).toBeLessThan(70)
})

// C-8
test('コメントブロック: 枠外のクエストはドラッグの影響を受けない (C-8)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await createCommentOverNode1(page)

  // ノード1を囲む小さなコメントなので、別ノード(3)は枠外のはず
  const before = await nodePos(page, '3')

  await page.getByTitle('選択').click()
  const cbox = await page.locator('[data-comment-id]').first().boundingBox()
  const hx = cbox!.x + cbox!.width / 2
  const hy = cbox!.y + 14
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(hx + 100, hy + 50, { steps: 12 })
  await page.mouse.up()

  // 枠外ノードは動かないこと
  const after = await nodePos(page, '3')
  expect(after.left).toBeCloseTo(before.left, 1)
  expect(after.top).toBeCloseTo(before.top, 1)
})

// C-9
test('コメントブロック: タイトルを複数行で入力・保持できる (C-9)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // コメントを作成 (右下の空きエリア)
  await page.getByTitle('コメントを追加').click()
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const box = await canvas.boundingBox()
  const sx = box!.x + box!.width - 350
  const sy = box!.y + box!.height - 250
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 220, sy + 140, { steps: 10 })
  await page.mouse.up()
  await expect(page.locator('[data-comment-id]')).toBeVisible({ timeout: 3000 })

  // ヘッダーをダブルクリック → textarea で複数行入力 (Enter で改行)
  const cbox = await page.locator('[data-comment-id]').first().boundingBox()
  await page.mouse.dblclick(cbox!.x + cbox!.width / 2, cbox!.y + 14)
  const ta = page.locator('[data-comment-id] textarea')
  await expect(ta).toBeVisible({ timeout: 2000 })
  await ta.fill('1行目\n2行目')
  await ta.press('Control+Enter') // 確定

  // 両方の行が表示されること (API 反映を待つためリトライ assertion を使う)
  const comment = page.locator('[data-comment-id]').first()
  await expect(comment).toContainText('1行目', { timeout: 3000 })
  await expect(comment).toContainText('2行目')

  // リロード後も複数行が保持されること
  await page.request.post(`${MOCK}/api/auth/quick`, { data: { token: 'demo-editor-token' } })
  await page.reload()
  const comment2 = page.locator('[data-comment-id]').first()
  await expect(comment2).toBeVisible({ timeout: 5000 })
  await expect(comment2).toContainText('1行目')
  await expect(comment2).toContainText('2行目')
})

// C-10
test('コメントブロック: プレイモードでは編集できない (C-10)', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await createCommentOverNode1(page)

  // 編集モードでコメントを保存済みにしておく (リロード後もプレイモードで表示されるように)
  // コメント位置を記録
  const cbox = await page.locator('[data-comment-id]').first().boundingBox()

  // プレイモードに切り替え
  await page.getByTitle('プレイモード').click()

  // ヘッダーをダブルクリックしても textarea が出ない (編集不可)
  await page.mouse.dblclick(cbox!.x + cbox!.width / 2, cbox!.y + 14)
  await expect(page.locator('[data-comment-id] textarea')).toHaveCount(0)

  // ヘッダーをドラッグしてもコメントが動かない
  const beforePos = await page.locator('[data-comment-id]').first().evaluate((el) => {
    const s = (el as HTMLElement).style
    return { left: s.left, top: s.top }
  })
  await page.mouse.move(cbox!.x + cbox!.width / 2, cbox!.y + 14)
  await page.mouse.down()
  await page.mouse.move(cbox!.x + cbox!.width / 2 + 120, cbox!.y + 14 + 80, { steps: 10 })
  await page.mouse.up()
  const afterPos = await page.locator('[data-comment-id]').first().evaluate((el) => {
    const s = (el as HTMLElement).style
    return { left: s.left, top: s.top }
  })
  expect(afterPos.left).toBe(beforePos.left)
  expect(afterPos.top).toBe(beforePos.top)
})
