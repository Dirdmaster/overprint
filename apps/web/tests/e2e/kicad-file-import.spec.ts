import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
const fixture = 'tests/fixtures/browser-import.kicad_pcb'

test('drops a raw KiCad PCB without a plugin or upload, shows both sides and restores the project', async ({ page }) => {
  const uploads: string[] = []
  page.on('request', request => { if (request.method() === 'POST') uploads.push(request.url()) })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click({ trial: true })
  const transfer = await page.evaluateHandle(text => {
    const data = new DataTransfer()
    data.items.add(new File([text], 'browser-import.kicad_pcb', { type: 'text/plain' }))
    return data
  }, readFileSync(fixture, 'utf8'))
  await page.getByRole('main').dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.getByRole('img', { name: 'browser-import front board preview' })).toBeVisible()
  await expect(page.getByLabel('60 × 40 mm')).toBeVisible()
  await expect(page.getByRole('note', { name: 'PCB file import' })).toBeVisible()
  await page.screenshot({ path: 'test-results/kicad-file-desktop.png' })
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('img', { name: 'browser-import back board preview' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(page.getByRole('img', { name: 'browser-import back board preview' })).toBeVisible()
  await expect(page.getByRole('note', { name: 'PCB file import' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/kicad-file-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(uploads).toEqual([])
})

test('file picker accepts PCB files and invalid imports and cancelled replacement preserve artwork', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await expect(page.getByLabel('Choose board export')).toHaveAttribute('accept', /\.kicad_pcb/)
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  await expect(page.getByRole('img', { name: 'browser-import front board preview' })).toBeVisible()
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  await page.getByLabel('More ways to open a board').click()
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'bad.kicad_pcb', mimeType: 'text/plain', buffer: Buffer.from('(kicad_pcb (version 20260206))') })
  await expect(page.getByRole('status')).toContainText('Edge.Cuts')
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  await page.getByRole('dialog', { name: 'Open another board?' }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await expect(page.getByRole('img', { name: 'browser-import front board preview' })).toBeVisible()
})

test('replaces an already imported PCB with a different dropped PCB', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  await expect(page.getByRole('img', { name: 'browser-import front board preview' })).toBeVisible()
  const transfer = await page.evaluateHandle(text => {
    const data = new DataTransfer()
    data.items.add(new File([text], 'replacement.kicad_pcb'))
    return data
  }, readFileSync(fixture, 'utf8'))
  await page.getByRole('main').dispatchEvent('drop', { dataTransfer: transfer })
  await page.getByRole('dialog', { name: 'Open another board?' }).getByRole('button', { name: 'Open board', exact: true }).click()
  await expect(page.getByRole('img', { name: 'replacement front board preview' })).toBeVisible()
})
