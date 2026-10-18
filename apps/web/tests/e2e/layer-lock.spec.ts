import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const graphic = (id: string, extra = {}) => ({
  id, name: id, side: 'front', visible: true,
  source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>',
  x: 2, y: 2, width: 10, height: 10, rotation: 0, ...extra
})
const artwork = [
  graphic('Free'),
  graphic('Child', { parentId: 'Folder', x: 15 }),
  graphic('Folder', { kind: 'folder', source: '', x: 0, y: 0, width: 1, height: 1 })
]
const project = {
  version: 1, side: 'front', silk: true, mask: '#202723', fabrication: false, artwork,
  board: { name: 'Lock test', bounds: { x: 0, y: 0, width: 40, height: 25 }, outline: 'M0 0 L40 0 L40 25 L0 25 Z', holes: '', layers: {} }
}
const open = async (page: Page, data = project) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({
    name: 'lock.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data))
  })
  await expect(page.getByRole('button', { name: 'Lock Free', exact: true })).toBeVisible()
}
const saved = async (page: Page) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'))
}
const item = (data: { artwork: { id: string; x: number; locked?: boolean }[] }, id: string) =>
  data.artwork.find(value => value.id === id)!

test('locked graphic ignores canvas drag and delete, then unlock restores editing and survives reopen', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Lock Free', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unlock Free', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const hit = page.locator('[data-artwork-layer="Free"] rect')
  await expect(hit).toHaveAttribute('pointer-events', 'none')
  const bounds = (await hit.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 20, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Delete Free', exact: true })).toBeDisabled()
  const locked = await saved(page)
  expect(item(locked, 'Free').locked).toBe(true)
  expect(item(locked, 'Free').x).toBe(2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lock Free', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unlock Free', exact: true })).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Unlock Free', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Unlock Free', exact: true }).click()
  await page.getByRole('button', { name: 'Free', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Free', exact: true }).click()
  expect(item(await saved(page), 'Free')).toBeUndefined()
})

test('folder lock protects descendants but permits visibility changes', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Lock Folder', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Child locked by parent', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Child', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete Folder', exact: true })).toBeDisabled()
  await expect(page.locator('[data-artwork-layer="Child"] rect')).toHaveAttribute('pointer-events', 'none')
  await page.getByRole('button', { name: 'Toggle Child', exact: true }).click()
  expect(item(await saved(page), 'Child').locked).toBeUndefined()
  await page.getByRole('button', { name: 'Unlock Folder', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lock Child', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Child', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Lock Child', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Delete Folder', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Folder', exact: true })).toHaveAttribute('draggable', 'false')
})

test('older project without lock fields remains editable', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('button', { name: 'Free', exact: true })).toBeEnabled()
  await expect(page.locator('[data-artwork-layer="Free"] rect')).toHaveAttribute('pointer-events', 'all')
})
