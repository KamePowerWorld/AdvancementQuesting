import { test } from '@playwright/test'
import { loginAs, openQuestModal } from './helpers.js'

test('item picker screenshot', async ({ page }) => {
  await page.goto('/')
  await loginAs(page, 'demo-editor-token')

  // エディタ全体のスクリーンショット
  await page.screenshot({ path: '../../tmp/ss-editor.png' })

  // quest 1 (oak_log - ブロック) のモーダルを開く
  await openQuestModal(page, '1')
  await page.waitForTimeout(500)
  await page.screenshot({ path: '../../tmp/ss-modal.png' })

  // アイコン変更ボタンをクリック
  await page.locator('[title="アイコンを変更"]').first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: '../../tmp/ss-item-picker.png' })
})
