import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { renderDrawing, defaultShape } from '../../app/utils/drawing'
import { renderVector } from '../../app/utils/vectorArtwork'
import { demoBoard } from '../fixtures/demoBoard'
import { routeGeist } from '../fixtures/googleFontFixture'
const shape = { id: 'shape', name: 'Editable badge', side: 'front', x: 3, y: 3, rotation: 0, visible: true, ...renderDrawing({ ...defaultShape('roundedRectangle', 6, 6), fill: '#123abc' }) }
const vector = { id: 'vector', name: 'Editable nodes', side: 'front', x: 12, y: 3, rotation: 0, visible: true, ...renderVector({ version: 1, width: 6, height: 6, fill: '#b13456', stroke: 'none', strokeWidth: 0, contours: [{ closed: true, points: [[0, 0], [6, 0], [6, 6], [0, 6]] }] }) }
const project = {
  version: 1, side: 'front', silk: true, mask: '#202723', fabrication: false,
  palette: [{ name: 'Acid', color: '#bbef23' }, { name: 'Ocean', color: '#123abc' }],
  board: { name: 'Paint workflow', bounds: { x: 0, y: 0, width: 30, height: 20 }, outline: 'M0,0 L30,0 L30,20 L0,20 Z', holes: '', layers: { 'front-silkscreen': ['M20,12 L26,12 L26,17 L20,17 Z'], 'back-silkscreen': [] } },
  artwork: [shape, vector]
}
const open = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'paint.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await expect(page.getByRole('img', { name: 'Paint workflow front board preview' })).toBeVisible()
  await page.getByRole('button', { name: shape.name, exact: true }).click()
  await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
}
const point = async (page: Page, x: number, y: number) => page.locator('[data-active-side="true"] [data-board-coordinates]').evaluate((g, [x, y]) => {
  const p = new DOMPoint(x, y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!)
  return { x: p.x, y: p.y }
}, [x, y])
const click = async (page: Page, x: number, y: number) => { const p = await point(page, x, y); await page.mouse.click(p.x, p.y) }
const save = async (page: Page) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'))
}

test('direct paint keeps geometry and selection while switching between artwork and native ink', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('complementary', { name: 'Board properties' }).getByLabel('Live paint settings')).toBeVisible()
  await expect(page.getByLabel('Live paint settings')).toHaveCount(1)
  await page.getByRole('button', { name: 'Paint Acid', exact: true }).click()
  await click(page, 6, 6)
  let saved = await save(page)
  expect(saved.artwork[0]).toMatchObject({ ...shape, source: saved.artwork[0].source, drawing: { ...shape.drawing, fill: '#bbef23' } })
  await click(page, 23, 14)
  await expect(page.getByLabel('Shape width (mm)', { exact: true })).toHaveValue('6')
  await page.getByRole('button', { name: vector.name, exact: true }).click()
  await page.getByRole('button', { name: 'Paint Blue', exact: true }).click()
  await click(page, 15, 6)
  saved = await save(page)
  expect(saved.artwork.find((item: any) => item.id === vector.id)).toMatchObject({ ...vector, source: expect.stringContaining('#3586e8'), vector: { ...vector.vector, fill: '#3586e8' } })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await save(page)).artwork.find((item: any) => item.id === vector.id)).toEqual(vector)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  expect((await save(page)).artwork.find((item: any) => item.id === vector.id).vector.fill).toBe('#3586e8')
})

for (const side of ['front', 'back']) test(`eyedropper samples visible ${side} ink independent of target without editing artwork`, async ({ page }) => {
  await open(page)
  if (side === 'back') {
    const data = structuredClone(project); data.side = 'back'; data.artwork.forEach(item => { item.side = 'back' })
    await page.getByLabel('Choose project file').setInputFiles({ name: 'back.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
    await page.getByRole('button', { name: shape.name, exact: true }).click()
    await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
  }
  const before = await save(page)
  await page.getByRole('button', { name: 'Pick ink color (I)' }).click()
  await click(page, 15, 6)
  await expect(page.getByRole('button', { name: 'Fill color: #b13456', exact: true })).toBeVisible()
  await expect(page.getByLabel('Paint feedback')).toHaveText('Sampled #B13456')
  expect((await save(page)).artwork).toEqual(before.artwork)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.locator('svg[role="img"]').focus()
  await page.keyboard.down('Alt')
  await click(page, 6, 6)
  await page.keyboard.up('Alt')
  await expect(page.getByRole('button', { name: 'Fill color: Ocean', exact: true })).toBeVisible()
  expect((await save(page)).artwork).toEqual(before.artwork)
  if (side === 'front') {
    await page.locator('svg[role="img"]').focus(); await page.keyboard.press('i'); await click(page, 23, 14)
    await expect(page.getByRole('button', { name: 'Fill color: #f4f1e8', exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Silkscreen', exact: true }).click()
    await page.getByRole('button', { name: 'Pick ink color (I)' }).click(); await click(page, 23, 14)
    await expect(page.getByLabel('Paint feedback')).toContainText('Choose a solid ink region')
    await expect(page.getByRole('button', { name: 'Pick ink color (I)' })).toHaveAttribute('aria-pressed', 'true')
  }
})

test('project swatches cycle in order and custom recent colors only appear after a fill', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Paint Acid', exact: true }).click()
  await page.locator('svg[role="img"]').focus(); await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Fill color: Ocean', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fill color: Ocean', exact: true }).click()
  const hex = page.getByRole('textbox', { name: 'Hex color', exact: true })
  await hex.fill('aabbdd'); await hex.press('Enter'); await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: 'Recent ink colors' })).toHaveCount(0)
  await click(page, 6, 6)
  await expect(page.getByRole('button', { name: 'Recent ink #aabbdd' })).toBeVisible()
  await page.getByRole('button', { name: 'Paint Pink', exact: true }).click()
  await page.getByRole('button', { name: 'Recent ink #aabbdd' }).click()
  await expect(page.getByRole('button', { name: 'Fill color: #aabbdd', exact: true })).toBeVisible()
})

test('mobile paint controls expand with one settings panel inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  const panel = page.getByLabel('Live paint settings')
  await expect(panel).toHaveCount(1)
  await expect(page.getByLabel('Paint source', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'More paint settings' }).click()
  await expect(page.getByRole('button', { name: 'Paint options', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'ENIG gold', exact: true }).click()
  await expect(page.getByRole('button', { name: 'ENIG gold', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const box = (await panel.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390)
})

test('painting Google text keeps its frozen font identity and edits offline', async ({ page }) => {
  await routeGeist(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByRole('button', { name: 'Draw text', exact: true }).click()
  await page.getByRole('img', { name: 'Demo board front board preview' }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  const before = (await save(page)).artwork[0]
  let downloads = 0
  await page.route('**/api/fonts/file?*', route => { downloads++; return route.fulfill({ status: 503 }) })
  await page.getByRole('button', { name: 'Live paint (K)' }).click()
  const p = await page.locator('[data-paint-source] path').first().evaluate(path => {
    const node = path as SVGGeometryElement, box = node.getBBox()
    for (let y = box.y + box.height / 20; y < box.y + box.height; y += box.height / 20)
      for (let x = box.x + box.width / 20; x < box.x + box.width; x += box.width / 20)
        if (node.isPointInFill(new DOMPoint(x, y))) { const p = new DOMPoint(x, y).matrixTransform(node.getScreenCTM()!); return { x: p.x, y: p.y } }
    throw new Error('No rendered glyph ink')
  })
  await page.getByRole('button', { name: 'Paint Blue', exact: true }).click()
  await page.mouse.click(p.x, p.y)
  const after = (await save(page)).artwork[0]
  expect(after.drawing).toEqual({ ...before.drawing, fill: '#3586e8' })
  expect(after).toMatchObject({ x: before.x, y: before.y, width: before.width, height: before.height, rotation: before.rotation })
  expect(after.source).toContain('#3586e8'); expect(downloads).toBe(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await save(page)).artwork[0]).toEqual(before)
})
