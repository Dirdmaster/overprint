import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 28"><path d="M0 0H10L30 28H20Z M15 0H25L40 21V28H35Z M0 12V26L2 28H12Z" fill="#c6f36b"/><path d="M0 28V21L30 0H40L0 28Z" fill="#9d85ff"/></svg>'
const board = { name: 'Compound paint', bounds: { x: 0, y: 0, width: 60, height: 60 }, outline: 'M0,0 L60,0 L60,60 L0,60 Z', holes: '', layers: {} }
const open = async (page: Page, side: string, svg = source) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'weave.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, side, silk: false, mask: '#202723', fabrication: false, board, artwork: [{ id: 'weave', name: 'Woven mark', source: svg, x: 10, y: 10, width: 40, height: 28, side, rotation: 15, visible: true }] })) })
  await page.getByRole('button', { name: 'Woven mark', exact: true }).click()
  await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
}
const point = async (page: Page, x: number, y: number) => page.locator('[data-artwork-layer="weave"] image').evaluate((image: SVGImageElement, [x, y]) => {
  const p = new DOMPoint(image.x.baseVal.value + x!, image.y.baseVal.value + y!).matrixTransform(image.getScreenCTM()!)
  return { x: p.x, y: p.y }
}, [x, y])
const save = async (page: Page) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'))
}
const pixels = async (page: Page, source: string, points = [[5, 2], [20, 2], [4, 26], [20, 10]]) => page.evaluate(async ({ source, points }) => {
  const image = new Image(); image.src = `data:image/svg+xml,${encodeURIComponent(source)}`; await image.decode()
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 280
  const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 400, 280)
  return points.map(([x, y]) => [...ctx.getImageData(x! * 10, y! * 10, 1, 1).data])
}, { source, points })
const lime = [198, 243, 107, 255], blue = [53, 134, 232, 255], purple = [157, 133, 255, 255]
for (const side of ['front', 'back']) test(`paints each disconnected stripe of the showcase compound path separately on ${side}`, async ({ page }) => {
  await open(page, side)
  await page.getByRole('button', { name: 'Paint Blue', exact: true }).click()
  const first = await point(page, 5, 2)
  await page.mouse.move(first.x, first.y)
  const preview = page.locator('[data-artwork-paint-preview] > path').first()
  await expect(preview).toHaveAttribute('d', /^M0[ ,]0\s*H10L30 28H20Z\s*$/)
  await page.mouse.click(first.x, first.y)
  const saved = await save(page)
  expect(saved.artwork).toHaveLength(1)
  expect(saved.board).toEqual(board)
  expect(await pixels(page, saved.artwork[0].source)).toEqual([blue, lime, lime, purple])
  await page.keyboard.press('Control+s'); await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload(); expect(await pixels(page, (await save(page)).artwork[0].source)).toEqual([blue, lime, lime, purple])
  await page.getByRole('button', { name: 'Woven mark', exact: true }).click()
  await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
  await page.getByRole('button', { name: 'Paint Blue', exact: true }).click()
  const second = await point(page, 20, 2), last = await point(page, 4, 26)
  await page.mouse.move(second.x, second.y); await page.mouse.down(); await page.mouse.move(last.x, last.y, { steps: 20 }); await page.mouse.up()
  expect((await pixels(page, (await save(page)).artwork[0].source)).slice(0, 3)).toEqual([blue, blue, blue])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await pixels(page, (await save(page)).artwork[0].source)).toEqual([blue, lime, lime, purple])
})

for (const fillRule of ['evenodd', 'nonzero']) test(`disconnected curved contours preserve ${fillRule} holes, islands and inherited styles`, async ({ page }) => {
  const outer = 'M2 14a6 6 0 1 0 12 0a6 6 0 1 0-12 0Z'
  // Opposite winding makes the counter a hole under both fill rules.
  const hole = 'M5 14a3 3 0 1 1 6 0a3 3 0 1 1-6 0Z'
  const island = 'M7 14a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z'
  const other = 'm17 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0Z'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 28"><g transform="translate(1 .5)" fill="#c6f36b" fill-rule="${fillRule}" stroke="#202723" stroke-width=".1"><path d="${outer} ${hole} ${island} ${other}"/></g></svg>`
  await open(page, 'front', svg)
  const before = await pixels(page, (await save(page)).artwork[0].source, [[4, 14], [7, 14], [9, 14], [28, 14]])
  expect(before).toEqual([lime, [0, 0, 0, 0], lime, lime])
  await page.getByRole('button', { name: 'Paint Blue', exact: true }).click()
  const hit = await point(page, 4, 14); await page.mouse.click(hit.x, hit.y)
  const painted = (await save(page)).artwork[0].source
  expect(painted).toContain(outer.slice(5)); expect(painted).toContain(hole.slice(5))
  expect(await pixels(page, painted, [[4, 14], [7, 14], [9, 14], [28, 14]])).toEqual([blue, [0, 0, 0, 0], blue, lime])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await save(page)).artwork[0].source).toBe(svg)
})

test('overlapping evenodd contours retain their transparent intersection', async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 28"><path fill="#c6f36b" fill-rule="evenodd" d="M2 2H20V20H2Z M12 2H30V20H12Z"/></svg>'
  await open(page, 'front', svg)
  await page.getByRole('button', { name: 'Paint Blue', exact: true }).click()
  const hit = await point(page, 5, 8); await page.mouse.click(hit.x, hit.y)
  expect(await pixels(page, (await save(page)).artwork[0].source, [[5, 8], [15, 8], [25, 8]])).toEqual([blue, [0, 0, 0, 0], blue])
})
