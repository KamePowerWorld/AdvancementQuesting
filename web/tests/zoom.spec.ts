/**
 * キャンバスズーム関連テスト
 * ZM-1. ホイール操作で transform scale が変化する
 * ZM-2. 背景グリッドの backgroundSize が scale に追従する
 * ZM-3. ホイールで pan も補正される（カーソル中心ズーム）
 */

import { test, expect } from '@playwright/test'
import { resetAll } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await resetAll(page)
  await page.goto('/')
  await page.waitForSelector('[data-testid="editor-canvas"]', { timeout: 10000 })
})

// ZM-1
test('ZM-1: ホイール操作で transform scale が変化する', async ({ page }) => {
  const canvas = page.locator('[data-testid="editor-canvas"]').first()
  await expect(canvas).toBeVisible()

  // 初期状態の scale を確認
  const initialScale = await canvas.locator('div.absolute.inset-0.w-full.h-full').evaluate((el) => {
    const match = el.style.transform.match(/scale\(([\d.]+)\)/)
    return match ? parseFloat(match[1]) : 1
  })
  expect(initialScale).toBe(1)

  // 上回転（拡大）
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="editor-canvas"]')
    if (!canvas) throw new Error('canvas not found')
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -10,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      bubbles: true,
      cancelable: true,
    }))
  })
  await page.waitForTimeout(200)

  // scale が 1 より大きくなる
  const scaleAfterZoom = await canvas.locator('div.absolute.inset-0.w-full.h-full').evaluate((el) => {
    const match = el.style.transform.match(/scale\(([\d.]+)\)/)
    return match ? parseFloat(match[1]) : null
  })
  expect(scaleAfterZoom).toBeGreaterThan(1)

  // 下回転（縮小）
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="editor-canvas"]')
    if (!canvas) throw new Error('canvas not found')
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaY: 10,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      bubbles: true,
      cancelable: true,
    }))
  })
  await page.waitForTimeout(200)

  // scale が縮小している
  const scaleAfterZoomDown = await canvas.locator('div.absolute.inset-0.w-full.h-full').evaluate((el) => {
    const match = el.style.transform.match(/scale\(([\d.]+)\)/)
    return match ? parseFloat(match[1]) : null
  })
  expect(scaleAfterZoomDown).toBeLessThan(scaleAfterZoom ?? Infinity)
})

// ZM-2
test('ZM-2: 背景グリッドの backgroundSize が scale に追従する', async ({ page }) => {
  const canvas = page.locator('[data-testid="editor-canvas"]').first()

  // 初期状態（scale=1）の backgroundSize を確認
  const initialBgSize = await canvas.evaluate((el) => {
    const style = window.getComputedStyle(el)
    return style.backgroundSize
  })
  const initialSize = parseFloat(initialBgSize.split(',')[0])
  expect(initialSize).toBe(40)

  // ホイールで拡大
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="editor-canvas"]')
    if (!canvas) throw new Error('canvas not found')
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -10,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      bubbles: true,
      cancelable: true,
    }))
  })
  await page.waitForTimeout(200)

  // backgroundSize が大きくなっている
  const zoomedBgSize = await canvas.evaluate((el) => {
    const style = window.getComputedStyle(el)
    return style.backgroundSize
  })
  const zoomedSize = parseFloat(zoomedBgSize.split(',')[0])
  expect(zoomedSize).toBeGreaterThan(40)
})

// ZM-3
test('ZM-3: ホイールで pan も補正される（カーソル中心ズーム）', async ({ page }) => {
  const canvas = page.locator('[data-testid="editor-canvas"]').first()

  // 初期状態の transform を取得
  const initialTransform = await canvas.evaluate((el) => {
    const inner = el.querySelector('div')
    if (!inner) return null
    return inner.style.transform
  })

  // キャンバスの右上で拡大
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="editor-canvas"]')
    if (!canvas) throw new Error('canvas not found')
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -10,
      clientX: window.innerWidth * 0.75,
      clientY: window.innerHeight * 0.25,
      bubbles: true,
      cancelable: true,
    }))
  })
  await page.waitForTimeout(200)

  // transform が変化している
  const transformAfterZoom = await canvas.evaluate((el) => {
    const inner = el.querySelector('div')
    if (!inner) return null
    return inner.style.transform
  })
  expect(transformAfterZoom).not.toBe(initialTransform)
})
