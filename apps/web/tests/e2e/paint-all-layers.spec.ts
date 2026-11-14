import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 6"><rect width="6" height="6" fill="#123abc"/></svg>'
const artwork = (id: string, x: number, extra = {}) => ({ id, name: id, source, x, y: 3, width: 6, height: 6, rotation: 0, visible: true, side: 'front', ...extra })
const project = {
  version: 1, side: 'front', silk: true, mask: '#202723', fabrication: false,
  board: { name: 'Any layer', bounds: { x: 0, y: 0, width: 40, height: 20 }, outline: 'M0,0 L40,0 L40,20 L0,20 Z', holes: '', layers: { 'front-silkscreen': ['M30,3 L36,3 L36,9 L30,9 Z'], 'back-silkscreen': [] } },
  artwork: [artwork('first', 3), artwork('folder', 0, { kind: 'folder', collapsed: true, source: '', width: 1, height: 1 }), artwork('second', 15, { parentId: 'folder' })]
}
const open = async (page: Page, data = project) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'layers.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
  await expect(page.getByRole('img', { name: `Any layer ${data.side} board preview` })).toBeVisible()
  await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
}
const point = async (page: Page, x: number, y: number) => page.locator('[data-active-side="true"] [data-board-coordinates]').evaluate((g, [x,y]) => {
  const p = new DOMPoint(x,y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!)
  return { x: p.x, y: p.y }
}, [x,y])
const click = async (page: Page, x: number, y: number) => { const p = await point(page,x,y); await page.mouse.click(p.x,p.y) }
const save = async (page: Page) => {
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click()
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'))
}

for (const side of ['front', 'back']) test(`default Paint reaches unselected layers, collapsed folders and native ink on ${side}`, async ({ page }) => {
  const data = structuredClone(project); data.side = side; data.artwork.forEach(item => { item.side = side })
  if (side === 'back') data.board.layers['back-silkscreen'] = data.board.layers['front-silkscreen']
  await open(page, data)
  await expect(page.getByRole('button', { name: 'Paint options' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Paint Blue', exact: true }).click()
  const start = await point(page,6,6), end = await point(page,33,6)
  await page.mouse.move(start.x,start.y); await page.mouse.down(); await page.mouse.move(end.x,end.y,{steps:30}); await page.mouse.up()
  const painted = await save(page)
  for (const id of ['first','second']) expect(painted.artwork.find((item: any) => item.id === id).source).toContain('#3586e8')
  expect(painted.artwork.find((item: any) => item.nativeSilk).nativeSilk.colors[project.board.layers['front-silkscreen'][0]!]).toBe('#3586e8')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await save(page)).artwork).toEqual(data.artwork)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.keyboard.press('Control+s'); await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload(); expect((await save(page)).artwork).toEqual(painted.artwork)
})

test('a selected layer never limits direct painting on other artwork or native ink', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'first', exact: true }).click()
  await page.getByRole('button', { name: 'Paint Pink', exact: true }).click()
  for (const x of [6, 18, 33]) await click(page,x,6)
  const saved = await save(page)
  for (const id of ['first','second']) expect(saved.artwork.find((item: any) => item.id === id).source).toContain('#fc7f9e')
  expect(saved.artwork.find((item: any) => item.nativeSilk).nativeSilk.colors[project.board.layers['front-silkscreen'][0]!]).toBe('#fc7f9e')
})

test('locked top artwork blocks painting through it, while hidden artwork is ignored', async ({ page }) => {
  const data = structuredClone(project)
  data.artwork = [artwork('bottom',3), artwork('locked',3,{ locked:true }), artwork('hidden',15,{visible:false})]
  await open(page,data)
  await click(page,6,6)
  await expect(page.getByRole('alert')).toContainText('Unlock this artwork')
  expect((await save(page)).artwork).toEqual(data.artwork)
  await expect(page.getByRole('button', { name:'Undo',exact:true })).toBeDisabled()
  await click(page,18,6)
  expect((await save(page)).artwork).toEqual(data.artwork)
})

test('an unrelated clipped graphic does not disable other layers and blocks clicks inside its frame', async ({ page }) => {
  const data = structuredClone(project)
  data.artwork = [artwork('first',3), artwork('clipped',15,{source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 6"><defs><clipPath id="c"><circle cx="3" cy="3" r="2"/></clipPath></defs><rect width="6" height="6" fill="#123abc" clip-path="url(#c)"/></svg>'})]
  await open(page,data)
  await click(page,6,6)
  expect((await save(page)).artwork[0].source).toContain('#ffd426')
  await click(page,18,6)
  await expect(page.getByRole('alert')).toContainText('clipped or masked')
  expect((await save(page)).artwork[1]).toEqual(data.artwork[1])
})


test('automatic Paint recolors the top visible layer and reaches the lower layer after hiding it', async ({ page }) => {
  const data = structuredClone(project); data.artwork = [artwork('bottom',3), artwork('top',3)]
  await open(page,data); await click(page,6,6)
  let saved = await save(page)
  expect(saved.artwork[0].source).toBe(source); expect(saved.artwork[1].source).toContain('#ffd426')
  await page.getByRole('button', { name:'Toggle top', exact:true }).click()
  await page.getByRole('button', { name:'Paint Blue', exact:true }).click(); await click(page,6,6)
  saved = await save(page)
  expect(saved.artwork[0].source).toContain('#3586e8'); expect(saved.artwork[1].source).toContain('#ffd426')
})

test('Paint presents no target or restriction controls', async ({ page }) => {
 await open(page)
 await expect(page.getByRole('combobox', {name:'Paint source'})).toHaveCount(0)
 await expect(page.getByRole('button', {name:'Paint options'})).toHaveCount(0)
 await expect(page.getByRole('button', {name:'Clear paint restriction'})).toHaveCount(0)
})
