import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const outline = 'M0,0 L30,0 L30,20 L0,20 Z'
const plaque = 'M2,2 L18,2 L18,18 L2,18 Z M4,16 L10,4 L16,16 Z'
const island = 'M9,10 L11,10 L11,13 L9,13 Z'
const project = {
  version: 1, side: 'front', silk: true, mask: '#202723', fabrication: false, artwork: [],
  board: { name: 'Paint test', bounds: { x: 0, y: 0, width: 30, height: 20 }, outline, holes: 'M5,13 L6,13 L6,14 L5,14 Z',
    layers: { 'front-silkscreen': [plaque, island, 'M21,3 L28,3 L21,9'], 'back-silkscreen': [plaque, island, 'M21,3 L28,3 L21,9 Z'], 'front-mask': ['M7,13 L8,13 L8,14 L7,14 Z'] } },
}
const open = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'paint.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await expect(page.getByRole('img', { name: 'Paint test front board preview' })).toBeVisible()
}
const point = async (page: Page, x: number, y: number) => page.getByRole('img', { name: /Paint test .* board preview/ }).evaluate((svg, [x, y]) => {
  const group = svg.querySelector(':scope > g') as SVGGraphicsElement
  const p = new DOMPoint(x, y).matrixTransform(group.getScreenCTM()!)
  return { x: p.x, y: p.y }
}, [x, y])
const paint = async (page: Page, x: number, y: number) => {
  const p = await point(page, x, y)
  await page.mouse.click(p.x, p.y)
}
const save = async (page: Page) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'))
}

test('paints an enclosed silkscreen cutout, preserves its island, and saves with undo', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('button', { name: 'Live paint (K)', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
  await paint(page, 10, 15)
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  const saved = await save(page)
  await page.getByRole('button', { name: 'Fill color: Yellow' }).click()
  await page.screenshot({ path: 'test-results/live-paint/palette-light.png' })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+d')
  await page.getByRole('button', { name: 'Fill color: Yellow' }).click()
  await page.screenshot({ path: 'test-results/live-paint/palette-dark.png' })
  await page.keyboard.press('Escape')
  expect(saved.board).toEqual(project.board)
  expect(saved.artwork[0].name).toBe('Yellow fill')
  expect(saved.artwork[0]).toMatchObject({ x: 4, y: 4, width: 12, height: 12, side: 'front' })
  // Rasterize the actual saved overlay, so cutout preservation is independent of path serialization.
  const pixels = await page.evaluate(async (source: string) => {
    const image = new Image(); image.src = `data:image/svg+xml,${encodeURIComponent(source)}`; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 120
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 120, 120)
    return { fill: [...ctx.getImageData(60, 110, 1, 1).data], island: [...ctx.getImageData(60, 70, 1, 1).data] }
  }, saved.artwork[0].source)
  expect(pixels.fill).toEqual([255, 212, 38, 255])
  expect(pixels.island[3]).toBe(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
})

test('recolors one region, respects board holes and open paths, and temporarily pans', async ({ page }) => {
  await open(page)
  await page.keyboard.press('k')
  await expect(page.getByRole('button', { name: 'Live paint (K)' })).toHaveAttribute('aria-pressed', 'true')
  for (const [x, y] of [[5.5, 13.5], [7.5, 13.5], [25, 4], [29, 19]]) await paint(page, x!, y!)
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
  await paint(page, 10, 15)
  await page.getByRole('button', { name: 'Fill color: Yellow' }).click()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await paint(page, 10, 15)
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  expect((await save(page)).artwork[0].name).toBe('Red fill')
  await page.getByRole('button', { name: 'Live paint (K)' }).focus()
  await page.keyboard.down('Space')
  await expect(page.getByRole('button', { name: 'Hand (hold Space)' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('Space')
  await expect(page.getByRole('button', { name: 'Live paint (K)' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('checkbox', { name: 'Silkscreen', exact: true }).click()
  await paint(page, 10, 15)
  await expect(page.getByRole('alert')).toHaveText('Show Silkscreen to paint its regions.')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
})

test('sweeps across regions with one undo and cycles colors at the cursor', async ({ page }) => {
  await open(page)
  await page.keyboard.press('k')
  const start = await point(page, 10, 15)
  const end = await point(page, 10, 11)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await expect(page.locator('[data-native-silkscreen] > path').nth(1)).toHaveAttribute('fill', '#ffd426')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
  await expect(page.locator('[data-native-silkscreen] > path').nth(1)).toHaveAttribute('fill', '#f4f1e8')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await expect(page.locator('[data-native-silkscreen] > path').nth(1)).toHaveAttribute('fill', '#ffd426')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Fill color: Pink', exact: true })).toBeVisible()
  await paint(page, 10, 15)
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await expect(page.locator('[data-native-silkscreen] > path').nth(1)).toHaveAttribute('fill', '#ffd426')
  expect((await save(page)).artwork.filter((item: any) => item.name === 'Pink fill')).toHaveLength(1)
})

test('chooses a custom color, keeps editing keys local, and paints that exact value', async ({ page }) => {
  await open(page)
  await page.keyboard.press('k')
  await page.getByRole('button', { name: 'Paint Pink', exact: true }).click()
  await page.getByRole('button', { name: 'Fill color: Pink', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Fill color', exact: true })
  const field = dialog.getByRole('slider', { name: 'Saturation and brightness' })
  await expect(field).toBeVisible()
  const box = (await field.boundingBox())!
  await page.mouse.click(box.x + box.width * .7, box.y + box.height * .2)
  await dialog.getByRole('slider', { name: 'Hue', exact: true }).fill('180')
  const hex = dialog.getByRole('textbox', { name: 'Hex color' })
  await hex.fill('zzzzzz'); await hex.press('Enter')
  await expect(hex).toHaveAttribute('aria-invalid', 'true')
  await hex.fill('26A6D1'); await hex.press('Enter')
  await expect(hex).toHaveAttribute('aria-invalid', 'false')
  await hex.press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'Fill color: #26a6d1', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await paint(page, 10, 15)
  const saved = await save(page)
  expect(saved.artwork[0].source).toContain('fill="#26a6d1"')
  // A color-control click must not strand keyboard focus there after painting.
  await paint(page, 10, 11)
  await page.keyboard.down('Space')
  await expect(page.getByRole('button', { name: 'Hand (hold Space)' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('Space')
  await expect(page.getByRole('button', { name: 'Live paint (K)' })).toHaveAttribute('aria-pressed', 'true')
})

test('cycles colors with arrows and A/D after choosing a swatch without stealing input keys', async ({ page }) => {
  await open(page)
  await page.keyboard.press('k')
  await page.getByRole('button', { name: 'Fill color: Yellow', exact: true }).click()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Fill color: White', exact: true })).toBeVisible()
  for (const [key, color] of [['a', 'Red'], ['d', 'White'], ['ArrowLeft', 'Red'], ['Shift+D', 'White']]) {
    await page.keyboard.press(key!)
    await expect(page.getByRole('button', { name: `Fill color: ${color}`, exact: true })).toBeVisible()
  }
  await page.keyboard.press('Control+d')
  await expect(page.getByRole('button', { name: 'Fill color: White', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fill color: White', exact: true }).click()
  const hex = page.getByRole('textbox', { name: 'Hex color', exact: true })
  await hex.fill(''); await hex.pressSequentially('ad')
  await expect(hex).toHaveValue('ad')
  await expect(page.getByRole('button', { name: 'Fill color: White', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Select (V / M)', exact: true }).click()
  await page.keyboard.press('a'); await page.keyboard.press('d'); await page.keyboard.press('ArrowRight')
  await page.keyboard.press('k')
  await expect(page.getByRole('button', { name: 'Fill color: White', exact: true })).toBeVisible()
})

test('ends a stroke on cancellation and respects rear-side coordinates', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.keyboard.press('k')
  const start = await point(page, 10, 15), end = await point(page, 10, 11)
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.keyboard.press('Escape')
  await page.mouse.move(end.x, end.y); await page.mouse.up()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await expect(page.locator('[data-native-silkscreen] > path').nth(1)).toHaveAttribute('fill', '#ffd426')
  expect((await save(page)).artwork.every((item: any) => item.side === 'back')).toBe(true)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('[data-native-silkscreen] > path').nth(1)).toHaveAttribute('fill', '#f4f1e8')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
})

test('front and mirrored back fills reach manufacturing ink with islands and pad cutouts intact', async ({ page }) => {
  await page.addInitScript(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle)
    Object.assign(window, { paintExport: [] })
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      if (typeof algorithm === 'object' && algorithm.name === 'AES-GCM') (window as any).paintExport.push(new TextDecoder().decode(data))
      return original(algorithm, key, data)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  const manufacturing = {
    ...project,
    board: { ...project.board, fabrication: { version: 1, copperLayers: 2, originMm: [0, 0], files: {
      ...Object.fromEntries(['F_Cu', 'B_Cu', 'F_Mask', 'B_Mask', 'F_Silkscreen', 'B_Silkscreen', 'Edge_Cuts'].map(name => [`fabrication/${name}.gbr`, '%MOMM*%\nM02*\n'])),
      'fabrication/drill.drl': 'M48\nM30\n',
    } } },
  }
  await page.getByLabel('Choose project file').setInputFiles({ name: 'paint.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(manufacturing)) })
  await page.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
  await paint(page, 10, 15)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await paint(page, 22, 4)
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
  await expect(page.locator('[data-native-silkscreen] > path').nth(2)).toHaveAttribute('fill', '#ffd426')
  const saved = await save(page)
  expect(saved.artwork).toHaveLength(2)
  expect(saved.board).toEqual(manufacturing.board)
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click()
  await download
  const ink = await page.evaluate(async () => {
    const capture = (window as any).paintExport as string[]
    const pixels = async (source: string, points: number[][]) => {
      const svg = new DOMParser().parseFromString(source, 'image/svg+xml')
      const image = new Image(); image.src = svg.querySelector('image')!.getAttribute('xlink:href')!; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0)
      return points.map(([x, y]) => [...ctx.getImageData(Math.floor(x! / 30 * image.width), Math.floor(y! / 20 * image.height), 1, 1).data])
    }
    return { front: await pixels(capture[0]!, [[10, 15], [10, 11], [5.5, 13.5], [7.5, 13.5]]), back: await pixels(capture[1]!, [[22, 4], [27, 8]]) }
  })
  expect(ink.front).toEqual([[255, 212, 38, 255], [255, 255, 255, 255], [0, 0, 0, 0], [0, 0, 0, 0]])
  expect(ink.back).toEqual([[255, 212, 38, 255], [32, 39, 35, 255]])
})
