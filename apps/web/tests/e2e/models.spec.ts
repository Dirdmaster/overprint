import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { unzipSync, zipSync, gunzipSync } from 'fflate'
import { componentBoard, componentGlb } from '../fixtures/componentBoard'
import { demoBoard } from '../fixtures/demoBoard'

const colors = async (canvas: import('@playwright/test').Locator) => canvas.evaluate(async element => {
  const image = new Image(); image.src = (element as HTMLCanvasElement).toDataURL(); await image.decode()
  const output = document.createElement('canvas'); output.width = image.width; output.height = image.height
  const context = output.getContext('2d')!; context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0,0,output.width,output.height).data
  let pink = 0, blue = 0
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index]! > 150 && pixels[index + 1]! < 90 && pixels[index + 2]! > 80) pink++
    if (pixels[index + 2]! > 150 && pixels[index]! < 90) blue++
  }
  return { pink, blue }
})

test('assembled models show the correct side, persist, and remain optional', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(componentBoard())
  await page.getByRole('button', { name: '3D', exact: true }).click()
  const canvas = page.getByRole('img', { name: 'Demo board assembled 3D preview' })
  await expect(canvas).toBeVisible()
  await expect(page.getByText(/Drag to orbit/)).toBeVisible()
  const front = await colors(canvas)
  expect(front.pink).toBeGreaterThan(100); expect(front.blue).toBeLessThan(10)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect.poll(async () => (await colors(canvas)).blue).toBeGreaterThan(100)
  const back = await colors(canvas)
  expect(back.blue).toBeGreaterThan(100); expect(back.pink).toBeLessThan(10)
  await page.getByText('2 components').click()
  await expect(page.getByText('No visible 3D model is assigned.')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  const project = JSON.parse(readFileSync((await (await downloaded).path())!, 'utf8'))
  expect(project.board.models.encoding).toBe('gzip-base64')
  expect(Buffer.from(gunzipSync(Buffer.from(project.board.models.glb,'base64')))).toEqual(componentGlb())
  await page.reload()
  await expect(page.getByRole('button', { name: '3D', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(page.getByText(/Drag to orbit/)).toBeVisible()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(canvas).toHaveCount(0)
  await page.getByText('2 components').click()
  await page.getByRole('button', { name: 'Remove component models' }).click()
  await expect(page.getByRole('button', { name: '3D', exact: true })).toBeDisabled()
  await page.getByLabel('More ways to open a board').click()
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByRole('dialog', { name: 'Open another board?' }).getByRole('button', { name: 'Open board', exact: true }).click()
  await expect(page.getByRole('button', { name: '3D', exact: true })).toBeDisabled()
})

test('external model assets are rejected before any network request and preserve current board', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  const files = unzipSync(componentBoard().buffer)
  const original = componentGlb()
  const oldLength = original.readUInt32LE(12)
  const document = JSON.parse(original.subarray(20,20 + oldLength).toString())
  document.buffers[0].uri = 'https://forbidden.invalid/model.bin'
  let json = Buffer.from(JSON.stringify(document)); json = Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)])
  const header = Buffer.from(original.subarray(0,20)); header.writeUInt32LE(28 + json.length + original.length - 28 - oldLength,8); header.writeUInt32LE(json.length,12)
  files['models/components.glb'] = Buffer.concat([header,json,original.subarray(20+oldLength)])
  const external: string[] = []; page.on('request', request => { if (request.url().includes('forbidden.invalid')) external.push(request.url()) })
  await page.getByLabel('More ways to open a board').click()
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'bad-model.overprint-board', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) })
  await expect(page.getByRole('status')).toContainText('Invalid component models')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('img', { name: 'Demo board front board preview' })).toBeVisible()
  expect(external).toEqual([])
})

test('oversized model members are rejected before decompression', async ({ page }) => {
  const files = unzipSync(componentBoard().buffer)
  files['models/components.glb'] = new Uint8Array(8 * 1024 * 1024 + 1)
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'large.overprint-board', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) })
  await expect(page.getByRole('status')).toContainText('8 MB limit')
})

test('autosave refuses an oversized project without replacing the saved copy', async ({ page }) => {
  // An unused native layer keeps the saved project just below the limit without
  // rendering millions of shapes. The next real SVG import takes it over.
  const project = {
    version: 1, side: 'front', silk: true, mask: '#202723', fabrication: false,
    board: { name: 'Saved board', bounds: { x: 0, y: 0, width: 56, height: 100 }, outline: 'M0 0L56 0L56 100L0 100Z', holes: '', layers: { unused: [' '.repeat(19_950_000)] } },
    artwork: [],
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'near-limit.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await expect(page.getByRole('img', { name: 'Saved board front board preview' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.getByLabel('Choose SVG graphic').setInputFiles({
    name: 'Over limit.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#ff00ff" d="M0 0 ${' '.repeat(100_000)}L10 0L10 10Z"/></svg>`),
  })
  await expect(page.getByRole('button', { name: 'Toggle Over limit.svg' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('20 MB limit')
  await page.reload()
  await expect(page.getByRole('img', { name: 'Saved board front board preview' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Toggle Over limit.svg' })).toHaveCount(0)
  await expect(page.getByText('No artwork yet')).toBeVisible()
})

test('3D surface artwork preserves back-side local orientation and hidden artwork', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(componentBoard())
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByLabel('Choose SVG graphic').setInputFiles({
    name: 'Rear marker.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6"><path d="M0 0H3V6H0Z" fill="#ff00ff"/><path d="M3 0H10V6H3Z" fill="#00ffff"/></svg>'),
  })
  await expect(page.getByRole('button', { name: 'Toggle Rear marker.svg' })).toBeVisible()
  await page.getByRole('button', { name: '3D', exact: true }).click()
  const canvas = page.getByRole('img', { name: 'Demo board assembled 3D preview' })
  await expect(page.getByText(/Drag to orbit/)).toBeVisible()
  const markerColors = () => canvas.evaluate(async element => {
    const image = new Image(); image.src = (element as HTMLCanvasElement).toDataURL(); await image.decode()
    const output = document.createElement('canvas'); output.width = image.width; output.height = image.height
    const context = output.getContext('2d')!; context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, output.width, output.height).data
    let magenta = 0, cyan = 0, magentaX = 0, cyanX = 0
    for (let index = 0; index < pixels.length; index += 4) {
      const x = (index / 4) % output.width
      if (pixels[index]! > 180 && pixels[index + 1]! < 80 && pixels[index + 2]! > 180) { magenta++; magentaX += x }
      if (pixels[index]! < 80 && pixels[index + 1]! > 180 && pixels[index + 2]! > 180) { cyan++; cyanX += x }
    }
    return { magenta, cyan, magentaX: magentaX / magenta, cyanX: cyanX / cyan }
  })
  const shown = await markerColors()
  expect(shown.magenta).toBeGreaterThan(100)
  expect(shown.cyan).toBeGreaterThan(100)
  // Both sides display artwork in its local reading direction. A mirrored rear
  // texture would incorrectly put the magenta stripe to the right of cyan.
  expect(shown.magentaX).toBeLessThan(shown.cyanX)
  await page.getByRole('button', { name: 'Toggle Rear marker.svg' }).click()
  await expect.poll(async () => { const colors = await markerColors(); return colors.magenta + colors.cyan }).toBe(0)
})

// Read the rendered silhouette, not private Three.js camera state.
const silhouette = async (canvas: import('@playwright/test').Locator) => canvas.evaluate(element => {
  const source = element as HTMLCanvasElement
  const copy = document.createElement('canvas'); copy.width = source.width; copy.height = source.height
  const context = copy.getContext('2d')!; context.drawImage(source, 0, 0)
  const pixels = context.getImageData(0, 0, copy.width, copy.height).data
  let left = copy.width, top = copy.height, right = 0, bottom = 0
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index]! > 128) {
    const x = ((index - 3) / 4) % copy.width, y = Math.floor(((index - 3) / 4) / copy.width)
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  const scale = source.getBoundingClientRect().width / copy.width
  return { x: (left + right - copy.width) * scale / 2, y: (top + bottom - copy.height) * scale / 2, width: (right - left) * scale, height: (bottom - top) * scale }
})

test('3D middle drag pans without zooming and resizing preserves the chosen camera', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(componentBoard())
  await page.getByRole('button', { name: '3D', exact: true }).click()
  const canvas = page.getByRole('img', { name: 'Demo board assembled 3D preview' })
  await expect(page.getByText(/Drag to orbit/)).toBeVisible()
  const before = await silhouette(canvas)
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
  await expect.poll(async () => (await silhouette(canvas)).x - before.x).toBeGreaterThan(65)
  await expect.poll(async () => Math.abs((await silhouette(canvas)).width - before.width)).toBeLessThan(3)
  await expect.poll(async () => (await silhouette(canvas)).y - before.y).toBeGreaterThan(30)
  // Let inertia finish before comparing a different viewport width.
  await expect.poll(async () => {
    const first = await silhouette(canvas)
    await canvas.evaluate(async () => {
      for (let frame = 0; frame < 6; frame++) await new Promise(requestAnimationFrame)
    })
    const next = await silhouette(canvas)
    return Math.max(Math.abs(next.x - first.x), Math.abs(next.y - first.y))
  }).toBeLessThan(.5)
  const panned = await silhouette(canvas)
  // Perspective changes the silhouette displacement slightly; catch excessive
  // pan gain without requiring an exact screen-space translation.
  expect(panned.x - before.x).toBeLessThan(90)
  expect(panned.y - before.y).toBeLessThan(50)
  await page.setViewportSize({ width: 1560, height: 960 })
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(box.width + 100)
  // ResizeObserver changes the backing buffer before the next WebGL frame.
  await expect.poll(async () => {
    const resized = await silhouette(canvas)
    return Math.max(Math.abs(resized.x - panned.x), Math.abs(resized.y - panned.y), Math.abs(resized.width - panned.width))
  }).toBeLessThan(3)
})


test('3D orbit eases after release and wheel zoom follows the cursor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(componentBoard())
  await page.getByRole('button', { name: '3D', exact: true }).click()
  const canvas = page.getByRole('img', { name: 'Demo board assembled 3D preview' })
  await expect(page.getByText(/Drag to orbit/)).toBeVisible()
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 40, { steps: 2 })
  await page.mouse.up()
  const moving = await canvas.evaluate(async element => {
    const source = element as HTMLCanvasElement
    const first = source.toDataURL()
    for (let index = 0; index < 8; index++) await new Promise(requestAnimationFrame)
    return first !== source.toDataURL()
  })
  expect(moving).toBe(true)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect.poll(async () => (await colors(canvas)).blue).toBeGreaterThan(100)
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await expect.poll(async () => (await colors(canvas)).pink).toBeGreaterThan(100)
  const before = await silhouette(canvas)
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2)
  await page.mouse.wheel(0, -200)
  await expect.poll(async () => (await silhouette(canvas)).width / before.width).toBeGreaterThan(1.05)
  await expect.poll(async () => (await silhouette(canvas)).x - before.x).toBeLessThan(-5)
})
