import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { componentBoard } from '../fixtures/componentBoard'

const left = 'M2 2 L8 2 L8 8 L2 8 Z'
const right = 'M18 2 L24 2 L24 8 L18 8 Z'
const board = { name: 'Native ink', bounds: { x: 0, y: 0, width: 30, height: 20 }, outline: 'M0 0 L30 0 L30 20 L0 20 Z', holes: '', layers: { 'front-silkscreen': [left, right], 'back-silkscreen': [left] }, fabrication: { version: 1, copperLayers: 2, originMm: [0, 0], files: {
  ...Object.fromEntries(['F_Cu', 'B_Cu', 'F_Mask', 'B_Mask', 'F_Silkscreen', 'B_Silkscreen', 'Edge_Cuts'].map(name => [`fabrication/${name}.gbr`, `G04 original ${name}*\n%MOMM*%\nM02*\n`])), 'fabrication/drill.drl': 'M48\nM30\n',
} } }
const project = { version: 1, side: 'front', silk: true, mask: '#202723', fabrication: false, board, artwork: [] }
const load = async (page: Page, value: unknown = project) => {
  await page.getByLabel('Choose project file').setInputFiles({ name: 'native.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) })
}
const open = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await load(page)
  await expect(page.getByRole('button', { name: 'KiCad silkscreen', exact: true })).toBeVisible()
}
const paint = async (page: Page, x = 3, y = 3) => {
  const point = await page.getByRole('img', { name: /Native ink .* board preview/ }).evaluate((svg, [x, y]) => {
    const group = svg.querySelector(':scope > g') as SVGGraphicsElement
    const p = new DOMPoint(x, y).matrixTransform(group.getScreenCTM()!)
    return { x: p.x, y: p.y }
  }, [x, y])
  await page.mouse.click(point.x, point.y)
}
const save = async (page: Page) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'))
}
const ink = (page: Page) => page.locator('[data-native-silkscreen] > path')

test('assembled preview updates native ink colors', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(componentBoard())
  await page.getByRole('button', { name: 'KiCad silkscreen', exact: true }).click()
  await page.getByRole('button', { name: '3D', exact: true }).click()
  const canvas = page.getByRole('img', { name: 'Demo board assembled 3D preview' })
  await expect(canvas).toBeVisible()
  const greenPixels = () => canvas.evaluate(async element => {
    const image = new Image(); image.src = (element as HTMLCanvasElement).toDataURL(); await image.decode()
    const copy = document.createElement('canvas'); copy.width = image.width; copy.height = image.height
    const context = copy.getContext('2d')!; context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1]! > 100 && pixels[i]! < 100 && pixels[i + 2]! < 100) count++
    return count
  })
  expect(await greenPixels()).toBe(0)
  await page.getByRole('button', { name: 'KiCad ink color: White', exact: true }).click()
  const hex = page.getByRole('textbox', { name: 'Hex color', exact: true })
  await hex.fill('00ff00'); await hex.press('Enter'); await page.keyboard.press('Escape')
  await expect.poll(greenPixels).toBeGreaterThan(30)
})

test('replaces selected KiCad ink without an overlay and preserves undo, sides and reload', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'KiCad silkscreen', exact: true }).click()
  await page.keyboard.press('k')
  await paint(page)
  await expect(ink(page).first()).toHaveAttribute('fill', '#ffd426')
  await expect(ink(page).nth(1)).toHaveAttribute('fill', '#f4f1e8')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
  let saved = await save(page)
  expect(saved.board).toEqual(board)
  expect(saved.artwork).toHaveLength(1)
  expect(saved.artwork[0].nativeSilk.colors).toEqual({ [left]: '#ffd426' })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(ink(page).first()).toHaveAttribute('fill', '#f4f1e8')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(ink(page).first()).toHaveAttribute('fill', '#f4f1e8')
  await page.getByRole('button', { name: 'Paint Blue', exact: true }).click()
  await paint(page)
  await expect(ink(page).first()).toHaveAttribute('fill', '#3586e8')
  await page.keyboard.press('Delete')
  await expect(ink(page).first()).toHaveAttribute('fill', '#3586e8')
  saved = await save(page)
  expect(saved.artwork).toHaveLength(2)
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(ink(page).first()).toHaveAttribute('fill', '#3586e8')
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await expect(ink(page).first()).toHaveAttribute('fill', '#ffd426')
  await page.getByRole('button', { name: 'KiCad silkscreen', exact: true }).click()
  await page.getByRole('button', { name: 'Reset KiCad colors', exact: true }).click()
  await expect(ink(page).first()).toHaveAttribute('fill', '#f4f1e8')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(ink(page).first()).toHaveAttribute('fill', '#ffd426')
  await page.getByRole('button', { name: 'Add layer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Layer 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('button', { name: 'KiCad silkscreen', exact: true }).click()
  await page.screenshot({ path: 'test-results/kicad-ink.png' })
})

test('base color respects individual edits; unmatched paths do not receive old paint', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'KiCad silkscreen', exact: true }).click()
  await page.keyboard.press('k'); await paint(page)
  await page.getByRole('button', { name: 'KiCad ink color: White', exact: true }).click()
  await page.getByRole('button', { name: 'Blue', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(ink(page).first()).toHaveAttribute('fill', '#ffd426')
  await expect(ink(page).nth(1)).toHaveAttribute('fill', '#3586e8')
  const saved = await save(page)
  await load(page, { ...saved, board: { ...board, layers: { ...board.layers, 'front-silkscreen': [right, 'M3 2 L9 2 L9 8 L3 8 Z'] } } })
  await expect(ink(page).first()).toHaveAttribute('fill', '#3586e8')
  await expect(ink(page).nth(1)).toHaveAttribute('fill', '#3586e8')
  await load(page, { ...saved, board: { ...board, layers: { ...board.layers, 'front-silkscreen': [right, left] } } })
  await expect(ink(page).nth(1)).toHaveAttribute('fill', '#ffd426')
  const bad = structuredClone(saved)
  bad.artwork[0].nativeSilk.colors[left] = 'url(https://invalid.example/paint)'
  await load(page, bad)
  await expect(page.getByRole('status')).toContainText('Invalid KiCad ink colors')
  await expect(ink(page).nth(1)).toHaveAttribute('fill', '#ffd426')
})

test('painting white explicitly replaces the preview ink without a new graphic', async ({ page }) => {
  await open(page)
  await page.keyboard.press('k')
  await page.getByRole('button', { name: 'Paint White', exact: true }).click()
  await paint(page)
  await expect(ink(page).first()).toHaveAttribute('fill', '#ffffff')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
})

test('exports replaced ink below artwork and omits only the edited conventional silk side', async ({ page }) => {
  await page.addInitScript(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle)
    Object.assign(window, { capturedInk: [] })
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      if (typeof algorithm === 'object' && algorithm.name === 'AES-GCM') (window as any).capturedInk.push(new TextDecoder().decode(data))
      return encrypt(algorithm, key, data)
    }
  })
  await open(page)
  await page.keyboard.press('k'); await paint(page)
  const saved = await save(page)
  await load(page, { ...saved, artwork: [...saved.artwork, { id: 'top', name: 'Top graphic', side: 'front', visible: true, x: 4, y: 4, width: 2, height: 2, rotation: 0, source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2" fill="#e63136"/></svg>' }] })
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click()
  const files = unzipSync(readFileSync((await (await download).path())!))
  expect(strFromU8(files['F_Silkscreen.gbr']!)).not.toContain('original F_Silkscreen')
  expect(strFromU8(files['B_Silkscreen.gbr']!)).toContain('original B_Silkscreen')
  expect(strFromU8(files['F_Cu.gbr']!)).toContain('original F_Cu')
  expect(strFromU8(files['drill.drl']!)).toBe(board.fabrication.files['fabrication/drill.drl'])
  const pixels = await page.evaluate(async () => {
    const svg = new DOMParser().parseFromString((window as any).capturedInk[0], 'image/svg+xml')
    const image = new Image(); image.src = svg.querySelector('image')!.getAttribute('xlink:href')!; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    return [[3, 3], [5, 5], [20, 3]].map(([x, y]) => [...context.getImageData(Math.floor(x! / 30 * image.width), Math.floor(y! / 20 * image.height), 1, 1).data])
  })
  expect(pixels).toEqual([[255, 212, 38, 255], [230, 49, 54, 255], [255, 255, 255, 255]])
})
