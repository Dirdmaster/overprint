import { expect, test } from '@playwright/test'
import { demoBoard } from '../fixtures/demoBoard'

for (const width of [1440, 390]) {
  test(`both sides fit beside each other by default at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
    await page.getByLabel('Choose board export').setInputFiles(demoBoard)
    const front = page.locator('[data-board-side="front"]')
    const back = page.locator('[data-board-side="back"]')
    await expect(front).toBeVisible()
    await expect(back).toBeVisible()
    await expect(page.getByRole('button', { name: 'Both', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const frontBox = (await front.boundingBox())!
    const backBox = (await back.boundingBox())!
    expect(frontBox.x + frontBox.width).toBeLessThan(backBox.x)
    expect(Math.abs(frontBox.y - backBox.y)).toBeLessThan(1)
    const toolbar = (await page.getByRole('toolbar', { name: 'Canvas tools' }).boundingBox())!
    expect(frontBox.x).toBeGreaterThan(toolbar.x + toolbar.width)
    expect(backBox.x + backBox.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `test-results/both-sides-${width}.png` })
    await back.locator('g[mask] > path').first().click()
    await expect(page.getByRole('img', { name: 'Demo board back board preview' })).toBeVisible()
    await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
    await expect(back.locator('[data-artwork-layer] image')).toHaveCount(1)
    await expect(front.locator('[data-artwork-layer] image')).toHaveCount(0)
    await page.getByRole('button', { name: 'Front', exact: true }).click()
    await expect(back).toHaveCount(0)
    await page.getByRole('button', { name: 'Both', exact: true }).click()
    await expect(back.locator('[data-artwork-layer] image')).toHaveCount(1)
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByRole('status')).toContainText('All changes saved')
    await page.reload()
    await expect(front).toBeVisible()
    await expect(back.locator('[data-artwork-layer] image')).toHaveCount(1)
  })
}
