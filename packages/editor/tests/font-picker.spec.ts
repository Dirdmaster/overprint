import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const converter = require('opentype.js')
const woff = readFileSync(new URL('../../../apps/web/app/assets/text-fonts/geist-latin-700-normal.woff', import.meta.url))
const ttf = Buffer.from(converter.parse(woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength)).toArrayBuffer())
// Synthetic catalogue, using licensed bundled font bytes rather than a live Google family.
const family = { family: 'Fixture Sans', category: 'sans-serif', version: 'v1', variants: [{ variant: 'regular', id: 'c'.repeat(64) }] }

test('font popup stays styled and clickable inside the embedded shadow root', async ({ page }, testInfo) => {
  await page.route('**/api/fonts/catalog?*', route => route.fulfill({ json: { families: [family], total: 1, offset: 0 } }))
  await page.route('**/api/fonts/file?*', route => route.fulfill({ contentType: 'font/ttf', body: ttf }))
  await page.goto('/tests/index.html')
  const editor = page.locator('overprint-editor').first()
  await editor.getByRole('button', { name: 'Draw text', exact: true }).click()
  await editor.getByRole('img', { name: 'Interaction test front board preview' }).click()
  const trigger = editor.getByRole('combobox', { name: 'Font family', exact: true })
  const inspector = editor.getByRole('complementary', { name: 'Board properties' })
  const before = await inspector.boundingBox()
  await trigger.click()
  const search = editor.getByRole('combobox', { name: 'Search font families' })
  await expect(search).toBeFocused()
  await search.fill('Fixture')
  const option = editor.getByRole('option', { name: 'Fixture Sans' })
  await expect(option).toBeVisible()
  const popup = editor.getByRole('listbox', { name: 'Font families' })
  expect(await popup.evaluate(node => node.getRootNode() instanceof ShadowRoot)).toBe(true)
  await expect(popup).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  expect(await inspector.boundingBox()).toEqual(before)
  // Real hit test checks overflow clipping, beyond visibility and rectangle assertions.
  expect(await option.evaluate(node => {
    const bounds = node.getBoundingClientRect()
    const root = node.getRootNode() as ShadowRoot
    return node.contains(root.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('fixture-font-picker-embedded.png') })
  await option.click()
  await expect(trigger).toContainText('Fixture Sans')
  await expect.poll(() => page.evaluate(() => (window as any).controllers[0].getDocument().artwork[0].drawing.google?.family)).toBe('Fixture Sans')
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(search).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => (window as any).controllers[1].getDocument().artwork)).toEqual([])
})
