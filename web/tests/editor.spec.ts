/**
 * クエストエディタの E2E テスト
 *
 * 前提: mock-server (port 3000) と vite dev server (port 5173) が起動済み
 * playwright.config.ts の webServer 設定で自動起動される
 *
 * テスト対象の UI 操作:
 *   1. 未ログイン状態の表示
 *   2. ログインモーダルの開閉
 *   3. 編集者ログイン → 保存ボタン表示 / クエストノードをクリックでモーダルが開く
 *   4. ログアウト
 *   5. プレイヤーログイン → 提案ボタン表示
 *   6. 提案モード ON → ツールバー拡張 / ナビバーの提案バー表示
 *   7. 提案モード: クエスト追加ツールでクリック → 提案ドラフトノード生成
 *   8. 提案ドラフトノードをクリック → クエスト編集モーダルが開く
 *   9. 提案モード: 既存クエストはクリックしてもモーダルが開かない
 *  10. 提案モードキャンセル → ツールバーが縮小・ドラフト消える
 *  11. 編集者: 移動ツールでノードをドラッグ → 位置が変わる
 *  12. コードログイン: ログインモーダルからコード入力でログイン
 *  13. 未ログイン: クエストクリックで読み取り専用モーダルが開く
 *  14. 保存永続化: 編集者がノードを移動して保存後リロードしても位置が保持される
 *  15. ログアウト→再ログインを繰り返しても正常にロールが表示される
 *  16. 提案送信フル: 送信後も提案モードで見える / 終了後・ログアウト後・再提案モードで表示制御が正しい
 *  17. 承認フル: 編集者が提案を承認 → 通常ノードとして表示 → 保存 → リロード後も保持
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** /api/auth/quick でセッションをupsertしてからトークンを注入してリロード */
async function loginAs(page: Page, token: 'demo-editor-token' | 'demo-player-token') {
  // quick エンドポイントでDBにセッションをupsert (ログアウト後でも確実に有効になる)
  await page.request.post('http://localhost:3001/api/auth/quick', { data: { token } })
  await page.evaluate((t) => localStorage.setItem('token', t), token)
  await page.reload()
  // スキンアイコン (ログアウトボタン) が表示されるまで待つ
  await expect(page.locator('button[title*="クリックでログアウト"]')).toBeVisible({ timeout: 8000 })
}

/** ログイン済みかを確認するセレクタ */
const loggedInBtn = (page: Page) => page.locator('button[title*="クリックでログアウト"]')
const loggedOutBtn = (page: Page) => page.locator('button[title="ログイン"]')

/** localStorage のトークンを削除してリロード */
async function logout(page: Page) {
  await page.evaluate(() => localStorage.removeItem('token'))
  await page.reload()
}

/** キャンバス上の指定ワールド座標にあるノードの DOM 要素を返す
 *  INITIAL_NODES の座標はワールド座標。pan=0,0 前提。 */
function nodeAtWorldPos(page: Page, wx: number, wy: number) {
  // キャンバス先頭の w-16 (64px) サイドバーを除いた canvas div の left を考慮
  // NodeEl は left:node.x, top:node.y で配置 (transform で pan 分ずれる)
  // テスト開始時は pan=0 なので canvas 内座標 = ワールド座標
  return page.locator(`[data-node-id]`).filter({
    // 最も近いノードを探す — 座標ピクセルで特定
    has: page.locator(`xpath=self::*[contains(@style,'left: ${wx}')]`),
  }).first()
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // キャンバスが描画されるまで待つ
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
})

// 1. 未ログイン状態
test('未ログイン: ログインボタン表示・提案ボタン非表示・保存ボタン非表示', async ({ page }) => {
  await expect(loggedOutBtn(page)).toBeVisible()
  await expect(loggedInBtn(page)).not.toBeVisible()
  await expect(page.getByText('💾 保存')).not.toBeVisible()
  await expect(page.getByText('クエスト追加を提案する')).not.toBeVisible()
})

// 2. ログインモーダルの開閉
test('ログインモーダル: 左バー下部アイコンをクリックで開閉', async ({ page }) => {
  // User アイコンボタン (left sidebar 最下部)
  const loginBtn = page.locator('button[title="ログイン"]')
  await expect(loginBtn).toBeVisible()
  await loginBtn.click()

  // モーダルが出る
  await expect(page.getByText('ログイン').first()).toBeVisible()
  await expect(page.getByText('編集者としてログイン')).toBeVisible()
  await expect(page.getByText('プレイヤーとしてログイン')).toBeVisible()

  // Escape キーで閉じる
  await page.keyboard.press('Escape')
  await expect(page.getByText('編集者としてログイン')).not.toBeVisible()
})

// 3. 編集者ログイン
test('編集者ログイン: 保存ボタン表示・ノードクリックでモーダル', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')

  // 保存ボタン
  await expect(page.getByText('💾 保存')).toBeVisible()

  // 提案ボタンは出ない
  await expect(page.getByText('クエスト追加を提案する')).not.toBeVisible()

  // ツールバーに移動・追加・リンク・削除ボタンがある
  await expect(page.getByTitle('移動')).toBeVisible()
  await expect(page.getByTitle('クエストを追加')).toBeVisible()

  // select モード (デフォルト) でノードをクリック → クエスト編集モーダルが開く
  // INITIAL_NODES[0]: x=100, y=100 → キャンバス座標 (サイドバー 64px 分ずれる)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const canvasBox = await canvas.boundingBox()!
  // ノードのワールド座標 100,100 → 画面座標: canvasLeft + 100, canvasTop + 100
  await page.mouse.click(canvasBox!.x + 100, canvasBox!.y + 100)

  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveValue('基本')

  // × ボタンで閉じる
  await page.getByRole('button', { name: '閉じる' }).last().click()
  await expect(page.getByPlaceholder('クエストのタイトル')).not.toBeVisible()
})

// 4. ログアウト
test('ログアウト: ロールバッジが消える', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await expect(loggedInBtn(page)).toBeVisible()

  // 左バー下部の LogOut ボタン
  const logoutBtn = loggedInBtn(page)
  await logoutBtn.click()

  // ロールバッジ消える
  await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })
})

// 5. プレイヤーログイン
test('プレイヤーログイン: 提案ボタン表示・保存ボタン非表示・ツールバーは矢印のみ', async ({ page }) => {
  await loginAs(page, 'demo-player-token')

  await expect(page.getByText('💾 保存')).not.toBeVisible()
  await expect(page.getByText('クエスト追加を提案する')).toBeVisible()

  // 矢印ボタンのみ (移動/追加/リンク/削除 は非表示)
  await expect(page.getByTitle('移動')).not.toBeVisible()
  await expect(page.getByTitle('クエストを追加')).not.toBeVisible()
})

// 6. 提案モード ON
test('提案モード ON: ツールバー拡張・ナビバーに提案バー', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()

  // ナビバーに提案バー (送信ボタンはドラフトが0件のため非表示)
  await expect(page.getByText(/提案モード/)).toBeVisible()
  await expect(page.locator('nav button', { hasText: '✕' })).toBeVisible()

  // ツールバーが拡張される
  await expect(page.getByTitle('移動')).toBeVisible()
  await expect(page.getByTitle('クエストを追加')).toBeVisible()
  await expect(page.getByTitle('依存関係を追加')).toBeVisible()
  await expect(page.getByTitle('削除')).toBeVisible()
})

// 7. 提案ドラフトノード追加
test('提案モード: クエスト追加ツールでクリック → ドラフトノード生成', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const canvasBox = await canvas.boundingBox()!

  const beforeCount = await page.locator('[data-node-id]').count()
  // キャンバス中央あたりをクリック
  await canvas.click({ position: { x: 300, y: 300 } })
  await expect(page.locator('[data-node-id]')).toHaveCount(beforeCount + 1, { timeout: 3000 })

  // 送信ボタンが出る (📤 アイコンで確認)
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 5000 })
})

// 8. 提案ドラフトをクリック → モーダルが開く
test('提案ドラフトノード: selectモードでクリックするとモーダルが開く', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  // ドラフトノードを追加
  await canvas.click({ position: { x: 300, y: 300 } })
  await expect(page.locator('[data-node-id]').last()).toBeVisible()

  // 矢印ツールに戻す
  await page.getByTitle('選択').click()

  // 追加したノードをクリック (最後に追加された node = 最後の [data-node-id])
  // 座標は canvas 内 300,300
  await canvas.click({ position: { x: 300, y: 300 } })
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
})

// 9. 提案モード: 既存クエストはクリックしてもモーダルが開かない
test('提案モード: 既存クエストノードを読み取り専用で開ける', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()

  // 既存ノードをクリック → 読み取り専用モーダルが開く
  const existingNode = page.locator('[data-node-id]:not([data-node-id^="draft-"]):not([data-node-id^="existing-proposal-"])').first()
  const box = await existingNode.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// 10. 提案モードキャンセル
test('提案モードキャンセル: ドラフト消滅・ツールバー縮小', async ({ page }) => {
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()
  // ツールが切り替わるまで少し待つ
  await page.waitForTimeout(200)

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const beforeCount = await page.locator('[data-node-id]').count()
  await canvas.click({ position: { x: 300, y: 300 } })
  await expect(page.locator('[data-node-id]')).toHaveCount(beforeCount + 1, { timeout: 3000 })

  // 提案モード終了
  await page.locator('nav button', { hasText: '✕' }).click()

  // ツールバー縮小
  await expect(page.getByTitle('クエストを追加')).not.toBeVisible()
  // ノード数がドラフト追加前に戻る
  await expect(page.locator('[data-node-id]')).toHaveCount(beforeCount, { timeout: 3000 })
  // 提案バー消える
  await expect(page.getByText('クエスト追加を提案する')).toBeVisible()
})

// 11. 編集者: 移動ツールでノードをドラッグ
test('編集者: moveモードでノードをドラッグすると位置が変わる', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByTitle('移動').click()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const canvasBox = await canvas.boundingBox()!

  // seed の QUEST_ID_1 は x=100, y=100 → 画面座標
  const nx = canvasBox!.x + 100
  const ny = canvasBox!.y + 100
  const targetX = nx + 80
  const targetY = ny + 60

  // ドラッグ
  await page.mouse.move(nx, ny)
  await page.mouse.down()
  await page.mouse.move(targetX, targetY, { steps: 10 })
  await page.mouse.up()

  // ノードの style.left が変化したことを確認
  const node = page.locator('[data-node-id="1"]')
  const style = await node.getAttribute('style')
  // left は元の 100px から離れているはず
  expect(style).not.toContain('left: 100px')
})

// 12. コードログイン
test('コードログイン: ログインモーダルからコード入力でログイン', async ({ page }) => {
  // 認証コードをリセット (使用済み/期限切れの可能性があるため)
  await page.request.post('http://localhost:3001/api/test/restore-auth-code')

  const loginBtn = page.locator('button[title="ログイン"]')
  await loginBtn.click()
  await expect(page.getByPlaceholder('123456')).toBeVisible({ timeout: 3000 })

  // コード入力フィールドに 123456 を入力
  const codeInput = page.getByPlaceholder('123456')
  await codeInput.fill('123456')
  // モーダル内の「ログイン」ボタン (exact match, サイドバーのログインボタンと区別)
  await page.locator('button').filter({ hasText: /^ログイン$/ }).click()

  // モーダルが閉じるまで待つ
  await expect(page.getByPlaceholder('123456')).not.toBeVisible({ timeout: 5000 })

  // ログイン成功 → token が localStorageに入っているのでリロードしてバッジを確認
  await page.reload()
  await expect(page.locator('[data-node-id]').first()).toBeVisible({ timeout: 10000 })
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
})

// 13. 未ログイン: クエストクリックで読み取り専用モーダルが開く
test('未ログイン: クエストノードをクリックすると読み取り専用モーダルが開く', async ({ page }) => {
  // 未ログイン状態を確認
  await expect(loggedInBtn(page)).not.toBeVisible()
  await expect(loggedInBtn(page)).not.toBeVisible()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const canvasBox = await canvas.boundingBox()!

  // seed の QUEST_ID_1 は x=100, y=100
  await page.mouse.click(canvasBox!.x + 100, canvasBox!.y + 100)

  // モーダルが開く
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })

  // 読み取り専用なので input が readonly 属性を持つ
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveAttribute('readonly', '')

  // × ボタンで閉じる
  await page.getByRole('button', { name: '閉じる' }).last().click()
  await expect(page.getByPlaceholder('クエストのタイトル')).not.toBeVisible()
})

// 14. 保存永続化
test('保存永続化: 編集者がノード移動後に保存するとリロード後も位置が保持される', async ({ page }) => {
  await loginAs(page, 'demo-editor-token')
  await page.getByTitle('移動').click()

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const canvasBox = await canvas.boundingBox()!

  // seed の QUEST_ID_1 は x=100, y=100
  const nx = canvasBox!.x + 100
  const ny = canvasBox!.y + 100
  const targetX = nx + 120
  const targetY = ny + 80

  // ドラッグして移動
  await page.mouse.move(nx, ny)
  await page.mouse.down()
  await page.mouse.move(targetX, targetY, { steps: 15 })
  await page.mouse.up()

  // 移動後の style を取得
  const node = page.locator('[data-node-id="1"]')
  const styleBefore = await node.getAttribute('style')
  expect(styleBefore).not.toContain('left: 100px')

  // 保存ボタンをクリック
  await page.getByText('💾 保存').click()
  // 保存完了まで待つ (トーストが出る)
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  // リロード後もログイン状態を維持して位置確認 (quick でセッション復元)
  await page.request.post('http://localhost:3001/api/auth/quick', { data: { token: 'demo-editor-token' } })
  await page.reload()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })

  // ノードが元の 100px の位置にない (移動後の位置になっている)
  const styleAfter = await page.locator('[data-node-id="1"]').getAttribute('style')
  expect(styleAfter).not.toContain('left: 100px')
})

// 15. ログアウト→再ログインの繰り返し
test('ログアウト→再ログインを繰り返しても正常にロールが表示される', async ({ page }) => {
  // 編集者でログイン → ログアウト → 再ログイン を2回繰り返す
  for (let i = 0; i < 2; i++) {
    // ログインモーダルを開いてクイックログイン (APIでセッション作成)
    await page.locator('button[title="ログイン"]').click()
    await expect(page.getByPlaceholder('123456')).toBeVisible({ timeout: 3000 })
    await page.getByText('✏️ 編集者としてログイン').click()
    // ロールバッジが出るまで待つ
    await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
    // 保存ボタンも表示されている
    await expect(page.getByText('💾 保存')).toBeVisible()

    // ログアウト
    await loggedInBtn(page).click()
    await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })
    // 保存ボタンも消えている
    await expect(page.getByText('💾 保存')).not.toBeVisible()
  }

  // 最後にプレイヤーでログインしても正常に動く
  await page.locator('button[title="ログイン"]').click()
  await expect(page.getByPlaceholder('123456')).toBeVisible({ timeout: 3000 })
  await page.getByText('🎮 プレイヤーとしてログイン').click()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('クエスト追加を提案する')).toBeVisible()
})

// 16. 提案送信フルシナリオ
test('提案送信: 送信後も提案モードで見える / 終了後・ログアウト後・再提案モードで表示制御が正しい', async ({ page }) => {
  // ---- プレイヤーとしてログイン ----
  await loginAs(page, 'demo-player-token')

  // ---- 提案モード有効化 ----
  await page.getByText('クエスト追加を提案する').click()
  await expect(page.getByText(/提案モード/)).toBeVisible()

  // ---- クエストを追加 ----
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  const baseCount = await page.locator('[data-node-id]').count()
  await canvas.click({ position: { x: 500, y: 300 } })
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount + 1, { timeout: 3000 })

  // ---- 提案を送信 ----
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  // [送信後] 提案モードが継続している
  await expect(page.getByText(/提案モード/)).toBeVisible()
  // [送信後] 送信した提案ノードがマップ上に見える (otherProposalNodes として表示)
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount + 1, { timeout: 5000 })
  // [送信後] 送信ボタンは消えている (ドラフトが0になったため)
  await expect(page.locator('nav button', { hasText: '📤' })).not.toBeVisible()

  // ---- 提案モード終了 ----
  await page.locator('nav button', { hasText: '✕' }).click()
  await expect(page.getByText(/提案モード/)).not.toBeVisible()
  // [終了後] 提案ノードは見えなくなる
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount, { timeout: 3000 })

  // ---- ログアウト ----
  await loggedInBtn(page).click()
  await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })
  // [ログアウト後] 提案ノードは見えない
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount, { timeout: 3000 })

  // ---- 再度プレイヤーとしてログイン (提案モードなし) ----
  await page.locator('button[title="ログイン"]').click()
  await page.getByText('🎮 プレイヤーとしてログイン').click()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  // [ログイン直後・提案モードなし] 提案ノードは見えない
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount, { timeout: 3000 })

  // ---- 提案モードを有効化 ----
  await page.getByText('クエスト追加を提案する').click()
  await expect(page.getByText(/提案モード/)).toBeVisible()
  // [提案モード有効化] 提案済みノードが見える
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount + 1, { timeout: 5000 })

  // ---- リロードしても提案ノードが見える ----
  await page.request.post('http://localhost:3001/api/auth/quick', { data: { token: 'demo-player-token' } })
  await page.reload()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  // リロード後は提案モードがリセットされるので再度有効化
  await page.getByText('クエスト追加を提案する').click()
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount + 1, { timeout: 5000 })

  // ---- ログアウトして編集者でログイン ----
  await loggedInBtn(page).click()
  await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })

  await page.locator('button[title="ログイン"]').click()
  await page.getByText('✏️ 編集者としてログイン').click()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  // [編集者] 提案ノードが見える (編集者は常にproposalsを取得する)
  await expect(page.locator('[data-node-id]')).toHaveCount(baseCount + 1, { timeout: 5000 })
})

// 17. 承認フル
test('承認フル: 編集者が提案を承認 → 通常ノード表示 → 保存 → リロード後も保持', async ({ page }) => {
  // テスト間の独立性: 前のテストで残った提案をクリア
  await page.request.post('http://localhost:3001/api/test/reset-proposals')

  // ---- Step 1: プレイヤーがクエストを提案 ----
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)

  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  // 提案ノードを追加 (既存ノードと被らない位置)
  await canvas.click({ position: { x: 550, y: 350 } })
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 3000 })

  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  // ログアウト
  await loggedInBtn(page).click()
  await expect(loggedInBtn(page)).not.toBeVisible({ timeout: 5000 })

  // ---- Step 2: 編集者でログイン → 提案ノードが見える ----
  await page.locator('button[title="ログイン"]').click()
  await page.getByText('✏️ 編集者としてログイン').click()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })

  // 編集者は常に proposals を取得するので提案ノードが見えるはず
  // 提案ノード (existing-proposal-*) が1件表示されるまで待つ
  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(1, { timeout: 5000 })
  // 提案ノード込みの総数を基準として記録
  const normalCount = await page.locator('[data-node-id]').count()

  // ---- Step 3: 提案ノードをクリック → モーダルに承認ボタン ----
  const proposalNode = page.locator('[data-node-id^="existing-proposal-"]').first()
  const box = await proposalNode.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByText('✓ 承認')).toBeVisible({ timeout: 3000 })

  // ---- Step 4: 承認ボタンを押す ----
  await page.getByText('✓ 承認').click()

  // モーダルが閉じる
  await expect(page.getByText('✓ 承認')).not.toBeVisible({ timeout: 3000 })

  // 提案ノードが消え、通常ノードとして追加される
  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(0, { timeout: 5000 })
  await expect(page.locator('[data-node-id]')).toHaveCount(normalCount, { timeout: 5000 })

  // ---- Step 5: 保存ボタンを押す ----
  await page.getByText('💾 保存').click()
  await expect(page.getByText('保存しました')).toBeVisible({ timeout: 5000 })

  // ---- Step 6: リロード後も承認済みクエストが表示される ----
  await page.request.post('http://localhost:3001/api/auth/quick', { data: { token: 'demo-editor-token' } })
  await page.reload()
  await expect(loggedInBtn(page)).toBeVisible({ timeout: 8000 })
  await expect(page.locator('[data-node-id]')).toHaveCount(normalCount, { timeout: 5000 })
})

// 18. 提案モード: 送信済み提案ノードをクリックするとモーダルが開き、いいねできる
test('提案モード: 送信済み提案ノードを開いていいねできる (18)', async ({ page }) => {
  await page.request.post('http://localhost:3001/api/test/reset-proposals')

  // プレイヤーが提案を送信
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  await canvas.click({ position: { x: 500, y: 300 } })
  await expect(page.locator('nav button', { hasText: '📤' })).toBeVisible({ timeout: 3000 })
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  // 送信済み提案ノードが表示される
  await expect(page.locator('[data-node-id^="existing-proposal-"]')).toHaveCount(1, { timeout: 5000 })

  // 送信後は add_node モードのまま → select に切り替えてからクリック
  await page.locator('button[title="選択"]').click()
  const proposalNode = page.locator('[data-node-id^="existing-proposal-"]').first()
  const box = await proposalNode.boundingBox()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByPlaceholder('クエストのタイトル')).toBeVisible({ timeout: 3000 })

  // 読み取り専用
  await expect(page.getByPlaceholder('クエストのタイトル')).toHaveAttribute('readonly', '')

  // いいねボタンが表示されている (👍 0)
  const likeBtn = page.getByRole('button', { name: /👍/ })
  await expect(likeBtn).toBeVisible()

  // いいねを押すと数が増える
  await likeBtn.click()
  await expect(page.getByRole('button', { name: /👍 1/ })).toBeVisible({ timeout: 3000 })

  await page.getByRole('button', { name: '閉じる' }).last().click()
})

// 19. 提案ノードのマップ上に提案者スキンアイコンが表示される
test('提案ノード: マップ上に提案者スキンアイコンが表示される (19)', async ({ page }) => {
  await page.request.post('http://localhost:3001/api/test/reset-proposals')

  // プレイヤーが提案
  await loginAs(page, 'demo-player-token')
  await page.getByText('クエスト追加を提案する').click()
  await page.getByTitle('クエストを追加').click()
  await page.waitForTimeout(200)
  const canvas = page.locator('.flex-grow.relative.overflow-hidden').first()
  await canvas.click({ position: { x: 500, y: 300 } })
  await page.locator('nav button', { hasText: '📤' }).click()
  await expect(page.getByText('提案を送信しました！')).toBeVisible({ timeout: 5000 })

  // 提案ノードが表示され、その中にスキンアイコン (mc-heads.net の img) がある
  const proposalNode = page.locator('[data-node-id^="existing-proposal-"]').first()
  await expect(proposalNode).toBeVisible({ timeout: 5000 })
  const skinImg = proposalNode.locator('img[src*="mc-heads.net"]')
  await expect(skinImg).toBeVisible()
})
