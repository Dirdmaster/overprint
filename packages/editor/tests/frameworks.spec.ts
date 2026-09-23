import { test, expect } from '@playwright/test'

test('React parts share a session, preserve history across props and dispose on unmount', async ({ page }) => {
  await page.goto('/tests/frameworks.html')
  await expect(page.getByRole('button', { name: 'Custom select' })).toBeVisible()
  await page.getByRole('button', { name: 'Custom select' }).click()
  await expect(page.getByRole('button', { name: 'Custom paint' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Live paint (K)' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Add layer', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).adapter.changes())).toBeGreaterThan(0)
  await page.evaluate(() => (window as any).adapter.render(false))
  await expect(page.locator('overprint-canvas .embedded-editor')).toHaveCSS('background-image', 'none')
  expect(await page.evaluate(() => (window as any).adapter.controls.at(-1).getDocument().artwork.length)).toBe(1)
  await page.evaluate(() => (window as any).adapter.unmount())
  await expect(page.locator('overprint-canvas')).toHaveCount(0)
  expect(await page.evaluate(() => { try { (window as any).adapter.controls.at(-1).getDocument(); return false } catch { return true } })).toBe(true)
})

test('React replacement and rapid remount leave only the latest live session', async ({ page }) => {
  await page.goto('/tests/frameworks.html')
  await expect(page.locator('overprint-canvas')).toHaveCount(1)
  await page.evaluate(() => (window as any).adapter.replace())
  await expect(page.getByRole('img', { name: 'Replacement front board preview' })).toBeVisible()
  await page.evaluate(() => { const a = (window as any).adapter; a.unmount(); a.mount(); a.unmount(); a.mount() })
  await expect(page.locator('overprint-canvas')).toHaveCount(1)
  expect(await page.evaluate(() => (window as any).adapter.controls.filter((editor: any) => { try { editor.getDocument(); return true } catch { return false } }).length)).toBe(1)
})
