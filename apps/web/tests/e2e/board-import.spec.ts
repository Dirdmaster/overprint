import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { demoBoard as fixture } from '../fixtures/demoBoard'
test('imports a board package, navigates both sides, and preserves it on failure', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  await expect(page.getByRole('img', { name: 'Demo board front board preview' })).toBeVisible()
  await expect(page.getByLabel('56 × 100 mm')).toBeVisible()
  await page.screenshot({ path: 'test-results/board-desktop.png' })
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: 'test-results/board-dark.png' })
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.getByRole('button', { name: 'Printed background: Black', exact: true }).click()
  await page.getByRole('button', { name: 'Blue', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Printed background: Blue', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Black', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Demo board back board preview' })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Zoom', exact: true })).toContainText('120%')
  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/board-mobile.png', fullPage: true })
  await page.getByLabel('More ways to open a board').click()
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'bad.overprint-board', mimeType: 'application/zip', buffer: Buffer.from('bad') })
  await expect(page.getByRole('status')).toContainText('Invalid board export')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('img', { name: 'Demo board back board preview' })).toBeVisible()
})
test('accepts a board dropped on the canvas', async ({ page }) => {
  await page.goto('/')
  // Synthetic dispatch skips actionability; wait until hydration releases inert.
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click({ trial: true })
  const bytes = [...fixture.buffer]
  const transfer = await page.evaluateHandle(bytes => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'board.overprint-board'))
    return data
  }, bytes)
  await page.getByRole('main').dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.getByRole('img', { name: 'Demo board front board preview' })).toBeVisible()
})

test('overlapping KiCad polygons stay filled and fabrication starts hidden', async ({ page }) => {
  const { zipSync, strToU8 } = await import('fflate')
  const manifest = { format: 'overprint-board', version: 1, board: { name: 'Overlap', boundsMm: { x: 0, y: 0, width: 100, height: 100 } }, coordinates: { units: 'mm', backDisplay: 'mirror-x-about-board-center' } }
  const geometry = { outlines: [{ outer: [[0,0],[100,0],[100,100],[0,100]], holes: [] }], holes: [], pads: [], footprints: [] }
  const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(manifest)), 'geometry.json': strToU8(JSON.stringify(geometry)) }
  for (const side of ['front', 'back']) for (const layer of ['silkscreen', 'mask', 'copper', 'fabrication']) {
    const paths = layer === 'silkscreen' ? '<path d="M20,20 L60,20 L60,80 L20,80 Z"/><path d="M40,20 L80,20 L80,80 L40,80 Z"/>' : ''
    files[`layers/${side}-${layer}.svg`] = strToU8(`<svg xmlns="http://www.w3.org/2000/svg"><g fill-rule="evenodd">${paths}</g></svg>`)
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'overlap.overprint-board', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) })
  const board = page.getByRole('img', { name: 'Overlap front board preview' })
  await expect(board).toBeVisible()
  const pixel = await board.evaluate(async node => {
    const svg = node.cloneNode(true) as SVGSVGElement
    svg.setAttribute('width', '230'); svg.setAttribute('height', '230')
    svg.setAttribute('viewBox', '0 0 100 100')
    const image = new Image()
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg))
    await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 230
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    return [...context.getImageData(115,115,1,1).data]
  })
  expect(pixel).toEqual([244, 241, 232, 255])
  await expect(page.getByRole('checkbox', { name: /Fabrication|Component outlines/ })).not.toBeChecked()
})

test('middle mouse pans temporarily and restores the selected tool', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  const canvas = page.getByRole('img', { name: 'Demo board front board preview' })
  const select = page.getByRole('button', { name: 'Select (V / M)', exact: true })
  const hand = page.getByRole('button', { name: 'Hand (hold Space)', exact: true })
  const bounds = (await canvas.boundingBox())!
  const before = await canvas.getAttribute('viewBox')
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down({ button: 'middle' })
  await expect(hand).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2 + 40)
  await expect(canvas).not.toHaveAttribute('viewBox', before!)
  await page.mouse.up({ button: 'middle' })
  await expect(select).toHaveAttribute('aria-pressed', 'true')
  const after = await canvas.getAttribute('viewBox')
  await page.mouse.move(bounds.x + 100, bounds.y + 100)
  await expect(canvas).toHaveAttribute('viewBox', after!)
  await page.keyboard.down('Space')
  await page.mouse.down({ button: 'middle' })
  await page.mouse.up({ button: 'middle' })
  await expect(hand).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('Space')
  await expect(select).toHaveAttribute('aria-pressed', 'true')
})


test('canvas extends behind the inspector while Fit keeps the board unobstructed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  const canvas = page.getByRole('img', { name: 'Demo board front board preview' })
  const panel = page.getByRole('complementary', { name: 'Board properties' })
  const outline = canvas.locator('g[mask] > path').first()
  const checkFit = async () => {
    const board = (await outline.boundingBox())!
    const card = (await panel.boundingBox())!
    const view = (await canvas.boundingBox())!
    expect(view.x + view.width).toBe(1440)
    expect(board.x).toBeGreaterThanOrEqual(view.x + 24)
    expect(board.x + board.width).toBeLessThan(card.x)
    expect(board.y).toBeGreaterThanOrEqual(view.y)
    expect(board.y + board.height).toBeLessThanOrEqual(view.y + view.height)
  }
  await checkFit()
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + 500, box.y + 300)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.x + 1100, box.y + 300)
  await page.mouse.up({ button: 'middle' })
  const moved = (await outline.boundingBox())!
  expect(moved.x + moved.width).toBeGreaterThan((await panel.boundingBox())!.x)
  await page.screenshot({ path: 'test-results/board-behind-sidebar.png' })
  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  await checkFit()
})

test('native fabrication survives import, autosave reload and project download', async ({ page }) => {
  const { unzipSync, zipSync, strToU8, strFromU8 } = await import('fflate')
  const files = unzipSync(fixture.buffer)
  const manifest = JSON.parse(strFromU8(files['manifest.json']!))
  const native = Object.fromEntries([
    ...['F_Cu', 'B_Cu', 'F_Mask', 'B_Mask', 'F_Silkscreen', 'B_Silkscreen', 'Edge_Cuts'].map(name => [`fabrication/${name}.gbr`, '%MOMM*%\r\nG04 exact native bytes*\r\nM02*\r\n']),
    ['fabrication/drill-0.drl', 'M48\nM30\n'],
  ])
  manifest.fabrication = { version: 1, copperLayers: 2, originMm: [0, 0], files: Object.keys(native) }
  for (const [name, value] of Object.entries(native)) files[name] = strToU8(value)
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'native.overprint-board', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) })
  await expect(page.getByRole('img', { name: 'Demo board front board preview' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(page.getByRole('img', { name: 'Demo board front board preview' })).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  const result = await downloaded
  const project = JSON.parse(readFileSync((await result.path())!, 'utf8'))
  expect(project.board.fabrication.files).toEqual(native)
})

test('background picker supports presets, custom color, Escape and saved color', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  const trigger = page.getByRole('button', { name: 'Printed background: Black', exact: true })
  await trigger.click()
  await expect(page.getByRole('button', { name: 'Black', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  const white = page.getByRole('button', { name: 'Printed background: White', exact: true })
  await expect(white).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Printed background', exact: true })
  await expect(dialog.getByRole('slider', { name: 'Hue', exact: true })).toBeVisible()
  await expect(dialog.getByRole('slider', { name: 'Saturation and brightness' })).toBeVisible()
  const hex = dialog.getByRole('textbox', { name: 'Hex color' })
  await hex.fill('39A7C2')
  await hex.press('Enter')
  const custom = page.getByRole('button', { name: 'Printed background: #39a7c2', exact: true })
  await expect(custom).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(custom).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'Printed background', exact: true })).not.toBeVisible()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(custom).toBeVisible()
})


test('board replacement offers a local backup, cancels safely and starts fresh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByLabel('More ways to open a board').click()
  await page.screenshot({ path: 'test-results/open-board-dropdown-desktop.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  const warning = page.getByRole('dialog', { name: 'Open another board?' })
  await expect(warning).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/replace-board-mobile.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const downloaded = page.waitForEvent('download')
  await warning.getByRole('button', { name: 'Save project', exact: true }).click()
  const backup = JSON.parse(readFileSync((await (await downloaded).path())!, 'utf8'))
  expect(backup.artwork.some((item: { source: string }) => item.source)).toBe(true)
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await page.getByLabel('More ways to open a board').click()
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  await warning.getByRole('button', { name: 'Open board', exact: true }).click()
  await expect(warning).not.toBeVisible()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(page.getByRole('img', { name: 'Demo board front board preview' })).toBeVisible()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
})
