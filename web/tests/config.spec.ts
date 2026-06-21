/**
 * C5: サーバー設定 (タイトル・Favicon) テスト
 *  C5-1. GET /api/config でタイトルが返る
 *  C5-2. document.title がサーバー設定のタイトルになる
 *  C5-3. favicon が設定される
 */

import { test, expect } from '@playwright/test'
import { MOCK } from './helpers.js'

// C5-1: /api/config でタイトルが返る
test('C5-1: GET /api/config でタイトルが返る', async ({ request }) => {
  const res = await request.get(`${MOCK}/api/config`)
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(typeof body.title).toBe('string')
  expect(body.title.length).toBeGreaterThan(0)
})

// C5-2: document.title がサーバー設定のタイトルになる
test('C5-2: document.title がサーバー設定のタイトルになる', async ({ page, request }) => {
  // mock-server の設定タイトルを取得
  const res = await request.get(`${MOCK}/api/config`)
  const { title } = await res.json()

  await page.goto('/')
  // タイトルが更新されるまで待機
  await expect(page).toHaveTitle(title, { timeout: 10000 })
})

// C5-3: index.html の link[rel="icon"] が /favicon.png を指している
test('C5-3: link[rel="icon"] が /favicon.png を指している', async ({ page }) => {
  await page.goto('/')
  const href = await page.evaluate(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    return link?.getAttribute('href') ?? ''
  })
  expect(href).toBe('/favicon.png')
})

// C5-4: /favicon.png が PNG を返す
test('C5-4: GET /favicon.png が image/png を返す', async ({ request }) => {
  const res = await request.get(`${MOCK}/favicon.png`)
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('image/png')
})
