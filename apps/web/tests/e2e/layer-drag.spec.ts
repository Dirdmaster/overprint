import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const svg = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${color}"/></svg>`
const graphic = (id: string, color: string, extra = {}) => ({ id, name: id, side: 'front', visible: true, source: svg(color), x: 2, y: 2, width: 10, height: 10, rotation: 0, ...extra })
const artwork = [graphic('Red', 'red'), graphic('Blue', 'blue'), graphic('Folder', 'none', { kind: 'folder', source: '', collapsed: true }), graphic('Child', 'green', { parentId: 'Folder' }), graphic('Back artwork', 'pink', { side: 'back' })]
const open = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  const project = { version: 1, side: 'front', silk: true, mask: '#202723', fabrication: false, artwork,
    board: { name: 'Drag test', bounds: { x: 0, y: 0, width: 30, height: 20 }, outline: 'M0 0 L30 0 L30 20 L0 20 Z', holes: '', layers: {} } }
  await page.getByLabel('Choose project file').setInputFiles({ name: 'drag.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await expect(page.getByRole('button', { name: 'Red', exact: true })).toBeVisible()
}
const order = (page: Page) => page.locator('[data-layer-row]').evaluateAll(rows => rows.map(row => row.getAttribute('data-layer-row')))
const canvasOrder = (page: Page) => page.locator('[data-artwork-layer] image').evaluateAll(images => images.map(image => image.parentElement!.getAttribute('data-artwork-layer')))
const drag = async (page: Page, source: string, target: string, y: number) => {
  await page.getByRole('button', { name: source, exact: true }).dragTo(page.locator(`[data-layer-row="${target}"]`), { targetPosition: { x: 110, y } })
}
const saved = async (page: Page) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'))
}

test('dragging layers changes stacking, supports one-step undo and persists', async ({ page }) => {
  await open(page)
  await drag(page, 'Red', 'Blue', 2)
  expect(await order(page)).toEqual(['Folder', 'Red', 'Blue'])
  expect(await canvasOrder(page)).toEqual(['Blue', 'Red', 'Child'])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await order(page)).toEqual(['Folder', 'Blue', 'Red'])
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  const result = await saved(page)
  expect(result.artwork.find((item: { id: string }) => item.id === 'Red')).toEqual(artwork[0])
  expect(result.artwork.find((item: { id: string }) => item.id === 'Back artwork')).toEqual(artwork[4])
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Red', exact: true })).toBeVisible()
  expect(await order(page)).toEqual(['Folder', 'Red', 'Blue'])
  await drag(page, 'Red', 'Blue', 32)
  expect(await order(page)).toEqual(['Folder', 'Blue', 'Red'])
})

test('dragging into a collapsed folder opens it and allows moving back to root', async ({ page }) => {
  await open(page)
  await drag(page, 'Red', 'Folder', 18)
  expect(await order(page)).toEqual(['Folder', 'Red', 'Child', 'Blue'])
  await expect(page.getByLabel('Move to')).toHaveValue('Folder')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await order(page)).toEqual(['Folder', 'Blue', 'Red'])
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  const source = (await page.getByRole('button', { name: 'Red', exact: true }).boundingBox())!
  await page.mouse.move(source.x + 30, source.y + 10)
  await page.mouse.down()
  await page.mouse.move(source.x + 45, source.y + 15, { steps: 4 })
  const root = page.locator('[data-layer-root-drop]')
  await expect(root).toBeVisible()
  const box = (await root.boundingBox())!
  await page.mouse.move(box.x + 50, box.y + 15, { steps: 4 })
  await expect(root).toHaveClass(/ring-accent/)
  await page.screenshot({ path: 'test-results/layer-drag-root.png' })
  await page.mouse.up()
  await expect(page.getByLabel('Move to')).toHaveValue('')
  expect(await order(page)).toEqual(['Folder', 'Child', 'Blue', 'Red'])
  await page.getByRole('button', { name: 'Delete Folder', exact: true }).click()
  expect(await canvasOrder(page)).toEqual(['Red', 'Blue'])
})

test('folder moves carry children, reject descendants, and cancelled drags do not edit', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Expand Folder', exact: true }).click()
  await drag(page, 'Folder', 'Child', 18)
  expect(await order(page)).toEqual(['Folder', 'Child', 'Blue', 'Red'])
  await drag(page, 'Folder', 'Red', 32)
  expect(await order(page)).toEqual(['Blue', 'Red', 'Folder', 'Child'])
  expect(await canvasOrder(page)).toEqual(['Child', 'Red', 'Blue'])
  const source = (await page.getByRole('button', { name: 'Blue', exact: true }).boundingBox())!
  await page.mouse.move(source.x + 30, source.y + 10)
  await page.mouse.down()
  await page.mouse.move(source.x + 45, source.y + 15, { steps: 4 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('[data-layer-root-drop]')).toHaveCount(0)
  expect(await order(page)).toEqual(['Blue', 'Red', 'Folder', 'Child'])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await order(page)).toEqual(['Folder', 'Child', 'Blue', 'Red'])
})

test('narrow layouts retain non-drag layer controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.getByRole('button', { name: 'Bring forward', exact: true }).click()
  expect(await order(page)).toEqual(['Folder', 'Red', 'Blue'])
  await page.getByLabel('Move to').selectOption('Folder')
  await page.getByRole('button', { name: 'Expand Folder', exact: true }).click()
  expect(await order(page)).toEqual(['Folder', 'Child', 'Red', 'Blue'])
  await page.keyboard.press('Control+d')
  await page.getByRole('complementary', { name: 'Board properties' }).screenshot({ path: 'test-results/layer-drag-mobile-dark.png' })
})
