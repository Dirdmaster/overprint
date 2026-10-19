import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 60"><g transform="translate(5 0)"><path id="ribbon" fill="#fc7f9e" stroke="#000" d="M10 50 C10 20 50 20 50 50 C50 80 10 80 10 50Z"/><circle id="knot" cx="70" cy="50" r="12" fill="#f4ebe2"/></g></svg>'
const board = { name: 'SVG paint', bounds: { x: 0, y: 0, width: 30, height: 20 }, outline: 'M0 0 L30 0 L30 20 L0 20 Z', holes: '', layers: { 'front-silkscreen': ['M0 0 L30 0 L30 20 L0 20 Z'], 'back-silkscreen': ['M0 0 L30 0 L30 20 L0 20 Z'], 'front-copper': [], 'front-mask': [], 'back-copper': [], 'back-mask': [] } }
const graphic = { id: 'bow', name: 'bow.svg', source, x: 3, y: 3, width: 20, height: 12, rotation: 30, visible: true }
const save = async (page: Page) => { const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click(); return JSON.parse(readFileSync((await (await download).path())!, 'utf8')) }
const point = async (page: Page, id: string, u: number, v: number) => page.locator(`[data-artwork-layer="${id}"] image`).evaluate((image: SVGImageElement, [u, v]: number[]) => { const p = new DOMPoint(image.x.baseVal.value + image.width.baseVal.value * u!, image.y.baseVal.value + image.height.baseVal.value * v!).matrixTransform(image.getScreenCTM()!); return { x: p.x, y: p.y } }, [u, v])

test('selected SVG shapes become editable ENIG layers while keeping the original graphic', async ({ page }) => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect x="0" y="0" width="2" height="2" fill="#fc7f9e"/></svg>'
  const project = { version: 1, side: 'front', silk: false, mask: '#202723', fabrication: false,
    board: { name: 'Gold SVG', bounds: { x: 0, y: 0, width: 20, height: 20 }, outline: 'M0,0 L20,0 L20,20 L0,20 Z', holes: '',
      layers: { 'front-silkscreen': [], 'front-copper': [], 'front-mask': [] } },
    artwork: [{ id: 'shape', name: 'shape.svg', side: 'front', source, x: 8, y: 8, width: 2, height: 2, rotation: 0, visible: true }] }
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'gold-svg.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('button', { name: 'shape.svg', exact: true }).click()
  await page.getByRole('button', { name: 'Live paint (K)' }).click()
  await page.getByRole('button', { name: 'ENIG gold' }).click()
  const hit = await point(page, 'shape', .5, .5)
  await page.mouse.click(hit.x, hit.y)
  const saved = await save(page)
  expect(saved.artwork).toHaveLength(2)
  expect(saved.artwork[0].source).toBe(source)
  expect(saved.artwork[1].gold.bounds).toEqual({ x: 8, y: 8, width: 2, height: 2 })
})

for (const side of ['front', 'back']) test(`paints selected curved SVG on ${side} in place and preserves undo and reload`, async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  const project = { version: 1, side, silk: false, mask: '#202723', fabrication: false, board, artwork: [{ ...graphic, side }] }
  await page.getByLabel('Choose project file').setInputFiles({ name: 'paint.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('button', { name: 'bow.svg', exact: true }).click()
  await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
  const ribbon = await point(page, 'bow', .25, .5), knot = await point(page, 'bow', .65, .5)
  await page.mouse.click(ribbon.x, ribbon.y)
  let result = await save(page)
  expect(result.artwork).toHaveLength(1)
  expect(result.artwork[0].source).toMatch(/id="ribbon"[^>]*fill="#ffd426"/)
  expect(result.artwork[0].source).toMatch(/id="knot"[^>]*fill="#f4ebe2"/)
  expect(result.artwork[0]).toMatchObject({ ...graphic, source: result.artwork[0].source, side })
  expect(result.board).toEqual(board)
  await page.getByRole('button', { name: 'Paint Blue', exact: true }).click()
  await page.mouse.move(ribbon.x, ribbon.y); await page.mouse.down(); await page.mouse.move(knot.x, knot.y, { steps: 10 }); await page.mouse.up()
  result = await save(page)
  expect(result.artwork[0].source.match(/fill="#3586e8"/g)).toHaveLength(2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  result = await save(page)
  expect(result.artwork[0].source).toMatch(/id="ribbon"[^>]*fill="#ffd426"/)
  expect(result.artwork[0].source).toMatch(/id="knot"[^>]*fill="#f4ebe2"/)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  result = await save(page)
  expect(result.artwork[0].source.match(/fill="#3586e8"/g)).toHaveLength(2)
})

test('scopes folders, hidden graphics and empty hits without falling through to native silk', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  const folder = { ...graphic, id: 'folder', name: 'Artwork', kind: 'folder', source: '', side: 'front' }
  const bottom = { ...graphic, id: 'bottom', name: 'Bottom.svg', side: 'front', rotation: 0 }
  const child = { ...graphic, parentId: 'folder', side: 'front', rotation: 0 }
  const project = { version: 1, side: 'front', silk: true, mask: '#202723', fabrication: false, board, artwork: [bottom, folder, child] }
  await page.getByLabel('Choose project file').setInputFiles({ name: 'paint.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('button', { name: 'Artwork', exact: true }).click()
  await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
  const hit = await point(page, 'bow', .25, .5), blank = await point(page, 'bow', .95, .9)
  await page.mouse.click(hit.x, hit.y)
  let result = await save(page)
  expect(result.artwork).toHaveLength(3)
  expect(result.artwork[0].source).toBe(source)
  expect(result.artwork[2].source).toContain('fill="#ffd426"')
  await page.mouse.click(blank.x, blank.y)
  expect((await save(page)).artwork).toEqual(result.artwork)
  await page.getByRole('button', { name: 'Toggle Artwork', exact: true }).click()
  await page.mouse.click(hit.x, hit.y)
  result = await save(page)
  expect(result.artwork[0].source).toBe(source)
  expect(result.artwork).toHaveLength(3)
  await page.getByRole('button', { name: 'Paint KiCad silkscreen', exact: true }).click()
  await page.mouse.click(blank.x, blank.y)
  result = await save(page)
  expect(result.artwork).toHaveLength(4)
  await expect(page.getByLabel('Paint target', { exact: true })).toHaveText('KiCad silkscreen')
})

// Original compound-path eye sockets: their dark centers are transparent holes,
// not black fill elements. This matches outlined SVG exports such as the bow.
const sockets = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path fill="#f4ebe2" fill-rule="evenodd" d="M5 5H95V55H5Z M25 30a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z M60 30a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z"/><path fill="#000000" fill-rule="evenodd" d="M25 30a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z M27 30a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z"/><path fill="#000000" fill-rule="evenodd" d="M60 30a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z M62 30a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z"/></svg>'
const socketProject = async (page: Page, side: string, source = sockets) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'eyes.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, side, silk: false, mask: '#202723', fabrication: false, board, artwork: [{ ...graphic, source, side }] })) })
  await page.getByRole('button', { name: 'bow.svg', exact: true }).click()
  await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
}
const inkPixel = async (page: Page, source: string, x: number, y: number) => page.evaluate(async ({ source, x, y }) => {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  await image.decode()
  const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 60
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0, 100, 60)
  return [...context.getImageData(x, y, 1, 1).data]
}, { source, x, y })

for (const side of ['front', 'back']) test(`fills one curved eye cutout on ${side} and keeps its live preview`, async ({ page }) => {
  await socketProject(page, side)
  const eye = await point(page, 'bow', .35, .5)
  await page.mouse.move(eye.x, eye.y)
  const preview = page.locator('[data-artwork-paint-preview] > *')
  await expect(preview).toHaveCount(2)
  const outline = (await preview.last().boundingBox())!
  expect(eye.x).toBeGreaterThan(outline.x)
  expect(eye.x).toBeLessThan(outline.x + outline.width)
  expect(eye.y).toBeGreaterThan(outline.y)
  expect(eye.y).toBeLessThan(outline.y + outline.height)
  await page.mouse.click(eye.x, eye.y)
  await expect(preview).toHaveCount(2)
  await page.keyboard.press('d')
  await expect(preview.first()).toHaveAttribute('fill', '#fc7f9e')
  await page.mouse.click(eye.x, eye.y)
  const result = await save(page)
  expect(result.artwork).toHaveLength(1)
  expect(result.board).toEqual(board)
  expect(await inkPixel(page, result.artwork[0].source, 35, 30)).toEqual([252, 127, 158, 255])
  expect(await inkPixel(page, result.artwork[0].source, 70, 30)).toEqual([0, 0, 0, 0])
  expect(await inkPixel(page, result.artwork[0].source, 26, 30)).toEqual([0, 0, 0, 255])
  expect(await inkPixel(page, result.artwork[0].source, 50, 30)).toEqual([244, 235, 226, 255])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await inkPixel(page, (await save(page)).artwork[0].source, 35, 30)).toEqual([255, 212, 38, 255])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const otherEye = await point(page, 'bow', .70, .5)
  await page.mouse.move(eye.x, eye.y); await page.mouse.down(); await page.mouse.move(otherEye.x, otherEye.y); await page.mouse.up()
  const swept = (await save(page)).artwork[0].source
  expect(await inkPixel(page, swept, 35, 30)).toEqual([252, 127, 158, 255])
  expect(await inkPixel(page, swept, 70, 30)).toEqual([252, 127, 158, 255])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await save(page)).artwork[0].source).toBe(sockets)
})

test('filled SVG hover preview survives a click and updates color while stationary', async ({ page }) => {
  await socketProject(page, 'front', source)
  const ribbon = await point(page, 'bow', .25, .5)
  await page.mouse.move(ribbon.x, ribbon.y)
  const preview = page.locator('[data-artwork-paint-preview] > *')
  await expect(preview).toHaveCount(2)
  const outline = (await preview.last().boundingBox())!
  expect(ribbon.x).toBeGreaterThan(outline.x)
  expect(ribbon.x).toBeLessThan(outline.x + outline.width)
  expect(ribbon.y).toBeGreaterThan(outline.y)
  expect(ribbon.y).toBeLessThan(outline.y + outline.height)
  await page.mouse.click(ribbon.x, ribbon.y)
  await expect(preview).toHaveCount(2)
  await page.keyboard.press('d')
  await expect(preview.first()).toHaveAttribute('fill', '#fc7f9e')
})

test('a drag can visit shapes before and after inserting a cutout face', async ({ page }) => {
  const original = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path fill="black" fill-rule="evenodd" d="M15 30a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z M17 30a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z"/><circle cx="80" cy="45" r="5" fill="red"/><circle cx="80" cy="15" r="5" fill="red"/></svg>'
  await socketProject(page, 'front', original)
  const first = await point(page, 'bow', .8, .25), hole = await point(page, 'bow', .25, .5), last = await point(page, 'bow', .8, .75)
  await page.mouse.move(first.x, first.y); await page.mouse.down()
  await page.mouse.move(hole.x, hole.y)
  // A visible frame between pointer events rebuilds the SVG paint surface.
  await expect(page.locator('[data-artwork-layer] image')).toHaveAttribute('href', /data-overprint-cutout/)
  await page.mouse.move(last.x, last.y); await page.mouse.up()
  const painted = (await save(page)).artwork[0].source
  for (const [x, y] of [[80, 15], [25, 30], [80, 45]]) expect(await inkPixel(page, painted, x!, y!)).toEqual([255, 212, 38, 255])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await save(page)).artwork[0].source).toBe(original)
})

for (const side of ['front', 'back']) test(`paints a hollow curved SVG face as ENIG on ${side}`, async ({ page }) => {
  await socketProject(page, side)
  await page.getByLabel('ENIG gold', { exact: true }).click()
  const eye = await point(page, 'bow', .35, .5)
  const other = await point(page, 'bow', .7, .5)
  const points = await page.getByRole('img', { name: `SVG paint ${side} board preview` }).evaluate((svg, positions) => positions.map(p => { const q = new DOMPoint(p.x, p.y).matrixTransform(svg.querySelector(':scope > g')!.getScreenCTM()!.inverse()); return { x: q.x, y: q.y } }), [eye, other])
  await page.mouse.click(eye.x, eye.y)
  await expect(page.getByRole('button', { name: 'Delete ENIG gold', exact: true })).toHaveCount(1)
  const result = await save(page)
  expect(result.artwork[0].source).toBe(sockets)
  expect(result.artwork).toHaveLength(2)
  const gold = result.artwork[1]
  expect(gold.side).toBe(side)
  expect(await page.evaluate(({ path, points }) => { const ctx = document.createElement('canvas').getContext('2d')!; return points.map(p => ctx.isPointInPath(new Path2D(path), p.x, p.y, 'evenodd')) }, { path: gold.gold.path, points })).toEqual([true, false])
  expect(gold.gold.bounds.width).toBeLessThan(5)
  expect(gold.gold.bounds.height).toBeLessThan(5)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await save(page)).artwork).toHaveLength(1)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect((await save(page)).artwork[1].gold).toEqual(gold.gold)
})

for (const fillRule of ['evenodd', 'nonzero']) test(`ENIG preserves compound SVG regions with ${fillRule} fill`, async ({ page }) => {
  // Same-winding nested contours are a hole only with evenodd fill.
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path fill="white" fill-rule="${fillRule}" d="M10 10H90V50H10Z m20 10h40v20H30Z"/></svg>`
  await socketProject(page, 'front', source)
  await page.getByLabel('ENIG gold', { exact: true }).click()
  const filled = await point(page, 'bow', .2, .5), center = await point(page, 'bow', .5, .5)
  const positions = await page.getByRole('img', { name: 'SVG paint front board preview' }).evaluate((svg, points) => points.map(p => { const q = new DOMPoint(p.x, p.y).matrixTransform(svg.querySelector(':scope > g')!.getScreenCTM()!.inverse()); return { x: q.x, y: q.y } }), [filled, center])
  await page.mouse.click(filled.x, filled.y)
  await expect(page.getByRole('button', { name: 'Delete ENIG gold', exact: true })).toHaveCount(1)
  const result = await save(page)
  expect(result.artwork[0].source).toBe(source)
  const path = result.artwork[1].gold.path
  const contains = await page.evaluate(({ path, positions }) => { const ctx = document.createElement('canvas').getContext('2d')!; return positions.map(p => ctx.isPointInPath(new Path2D(path), p.x, p.y, 'evenodd')) }, { path, positions })
  expect(contains).toEqual([true, fillRule === 'nonzero'])
})

test('ENIG in an SVG hollow face preserves its enclosed island', async ({ page }) => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path fill="white" fill-rule="evenodd" d="M5 5H95V55H5Z M15 15H85V45H15Z M40 25H60V35H40Z"/></svg>'
  await socketProject(page, 'front', source)
  await page.getByLabel('ENIG gold', { exact: true }).click()
  const face = await point(page, 'bow', .25, .5), island = await point(page, 'bow', .5, .5)
  const positions = await page.getByRole('img', { name: 'SVG paint front board preview' }).evaluate((svg, points) => points.map(p => { const q = new DOMPoint(p.x, p.y).matrixTransform(svg.querySelector(':scope > g')!.getScreenCTM()!.inverse()); return { x: q.x, y: q.y } }), [face, island])
  await page.mouse.click(face.x, face.y)
  await expect(page.getByRole('button', { name: 'Delete ENIG gold', exact: true })).toHaveCount(1)
  const result = await save(page)
  expect(result.artwork[0].source).toBe(source)
  const path = result.artwork[1].gold.path
  expect(await page.evaluate(({ path, positions }) => { const ctx = document.createElement('canvas').getContext('2d')!; return positions.map(p => ctx.isPointInPath(new Path2D(path), p.x, p.y, 'evenodd')) }, { path, positions })).toEqual([true, false])
})
