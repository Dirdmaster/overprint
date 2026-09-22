import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
import { demoBoard as fixture } from '../fixtures/demoBoard'
const nativeFiles = () => Object.fromEntries([
  ...['F_Cu','B_Cu','F_Mask','B_Mask','F_Silkscreen','B_Silkscreen','Edge_Cuts'].map(name => [`fabrication/${name}.gbr`, strToU8('%MOMM*%\r\nM02*\r\n')]),
  ['fabrication/drill-0.drl', strToU8('M48\nM30\n')],
])
const packageBytes = () => {
  const files = unzipSync(fixture.buffer)
  const native = nativeFiles()
  const manifest = JSON.parse(strFromU8(files['manifest.json']!))
  manifest.fabrication = { version: 1, copperLayers: 2, originMm: [0,0], files: Object.keys(native) }
  return Buffer.from(zipSync({ ...files, ...native, 'manifest.json': strToU8(JSON.stringify(manifest)) }))
}
test('order guide displays all four screenshots', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'native.overprint-board', mimeType: 'application/zip', buffer: packageBytes() })
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Pause guide' }).click()
  for (const [index, name] of ['settings', 'multicolor', 'open-viewer', 'viewer'].entries()) {
    const response = await page.request.get(`/guides/jlcpcb/${name}.png`)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
    await dialog.getByRole('button', { name: new RegExp(`^${index + 1} `) }).click()
    if (index === 2) {
      await expect(dialog.locator('svg image')).toHaveAttribute('href', `/guides/jlcpcb/${name}.png`)
      await expect(dialog.locator('svg image')).toBeVisible()
      await dialog.locator('svg image').evaluate(async (element) => {
        const image = new Image()
        image.src = element.getAttribute('href')!
        await image.decode()
      })
    } else {
      const image = dialog.locator(`img[src="/guides/jlcpcb/${name}.png"]`)
      await expect(image).toBeVisible()
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
    }
    await page.screenshot({ path: `test-results/release/guide-${name}.png` })
  }
})
test('guide falls back to diagrams when screenshot requests fail', async ({ page }) => {
  await page.clock.install()
  await page.route('**/guides/jlcpcb/*.png', route => route.fulfill({ status: 404, body: '' }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'native.overprint-board', mimeType: 'application/zip', buffer: packageBytes() })
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  await page.clock.fastForward(4100)
  await expect(page.getByRole('button', { name: '2 Full color', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '1 Board finish', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('img', { name: 'Board finish: White, ENIG, 1 microinch gold' })).toBeVisible()
  await dialog.getByRole('button', { name: '2 Full color', exact: true }).click()
  await expect(dialog.getByRole('img', { name: 'Advanced Options: EasyEDA multi-color Silkscreen' })).toBeVisible()
  await dialog.getByRole('button', { name: '3 Open viewer', exact: true }).click()
  await expect(dialog.getByRole('img', { name: 'Click Gerber Viewer above the board preview' })).toBeVisible()
  await expect(dialog).toContainText('Colors aren’t shown in the normal quote preview.')
  await dialog.getByRole('button', { name: '4 Check preview', exact: true }).click()
  await expect(dialog.getByRole('img', { name: 'Check artwork on both sides and keep exposed pads clear' })).toBeVisible()
  await page.screenshot({ path: 'test-results/release/source-guide.png' })
})
test('downloads current artwork and native fabrication, then sends to a new quote tab', async ({ page, context }) => {
  // Install before app timers exist so pause/resume never mixes real and fake timers.
  await page.clock.install()
  await page.addInitScript(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle)
    const captured: string[] = []
    Object.assign(window, { colorSvgForTest: captured })
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      if (typeof algorithm === 'object' && algorithm.name === 'AES-GCM') captured.push(new TextDecoder().decode(data))
      return original(algorithm, key, data)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'native.overprint-board', mimeType: 'application/zip', buffer: packageBytes() })
  await expect(page.getByRole('img', { name: 'Demo board front board preview' })).toBeVisible()
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Export to JLCPCB')
  await expect(page.getByRole('dialog')).toHaveClass(/max-w-7xl/)
  await page.getByRole('button', { name: '2 Full color', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reduce guide', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toContainText('Advanced Options → EasyEDA multi-color silkscreen.')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveClass(/max-w-7xl/)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click()
  const download = await downloadEvent
  const files = unzipSync(readFileSync((await download.path())!))
  for (const [name, bytes] of Object.entries(nativeFiles())) {
    const exported = files[name.slice(12)]!
    if (name.endsWith('.gbr')) {
      const text = strFromU8(exported)
      expect(text).toMatch(/^G04 EasyEDA Pro v2\.2\.42\.2, /)
      expect(strToU8(text.split('G04 Overprint compatibility export from KiCad*\n')[1]!)).toEqual(bytes)
    } else expect(exported).toEqual(bytes)
  }
  for (const name of ['Fabrication_ColorfulTopSilkscreen.FCTS','Fabrication_ColorfulBottomSilkscreen.FCBS','Fabrication_ColorfulBoardOutlineLayer.FCBO']) expect(files[name]!.length).toBeGreaterThan(528)
  const containsPinkInk = await page.evaluate(async () => {
    const captured = (window as unknown as { colorSvgForTest: string[] }).colorSvgForTest
    const svg = new DOMParser().parseFromString(captured[0]!, 'image/svg+xml')
    const image = new Image()
    image.src = svg.querySelector('image')!.getAttribute('xlink:href')!
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 252 && pixels[i+1] === 127 && pixels[i+2] === 158 && pixels[i+3] === 255) return true
    }
    return false
  })
  expect(containsPinkInk).toBe(true)
  const geometry = await page.evaluate(() => {
    const captured = (window as unknown as { colorSvgForTest: string[] }).colorSvgForTest
    const parse = (source: string) => new DOMParser().parseFromString(source, 'image/svg+xml')
    const top = parse(captured[0]!), bottom = parse(captured[1]!), outline = parse(captured[2]!)
    const box = top.documentElement.getAttribute('viewBox')!.split(' ').map(Number)
    const transform = bottom.querySelector('g')!.getAttribute('transform')!
    // An off-center native point must land at its reflected bottom-view position.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const group = document.createElementNS(svg.namespaceURI, 'g') as SVGGElement
    group.setAttribute('transform', transform); svg.append(group)
    const point = new DOMPoint(box[0]! + box[2]! * .2, box[1]! + box[3]! * .3)
    const reflected = point.matrixTransform(group.transform.baseVal.consolidate()!.matrix)
    return {
      version: top.documentElement.getAttribute('eda-version'),
      sameBox: outline.documentElement.getAttribute('viewBox') === top.documentElement.getAttribute('viewBox'),
      outline: outline.querySelector('path')?.getAttribute('d'),
      fill: outline.querySelector('path')?.getAttribute('fill'),
      reflectedX: reflected.x, expectedX: box[0]! + box[2]! * .8,
      reflectedY: reflected.y, expectedY: point.y,
    }
  })
  const original = JSON.parse(strFromU8(unzipSync(fixture.buffer)['geometry.json']!))
  const expectedOutline = original.outlines.map((p: { outer: number[][]; holes: number[][][] }) =>
    [p.outer, ...p.holes].map(ring => 'M' + ring.map(point => point.join(',')).join(' L') + ' Z').join(' '),
  ).join(' ')
  expect(geometry.version).toBe('2.4(2026-05-08)')
  expect(geometry.sameBox).toBe(true)
  expect(geometry.outline).toBe(expectedOutline)
  expect(geometry.fill).toBe('none')
  expect(geometry.reflectedX).toBeCloseTo(geometry.expectedX, 3)
  expect(geometry.reflectedY).toBeCloseTo(geometry.expectedY, 3)

  let received = false
  let uploadAttempts = 0
  let releaseUpload!: () => void
  const uploadReady = new Promise<void>(resolve => { releaseUpload = resolve })
  await page.route('**/api/jlcpcb/upload', async route => {
    uploadAttempts++
    if (uploadAttempts === 1) {
      await route.fulfill({ status: 502, json: { statusMessage: 'Upload timed out or was cancelled.' } })
      return
    }
    const zipped = unzipSync(route.request().postDataBuffer()!)
    expect(zipped['Fabrication_ColorfulBottomSilkscreen.FCBS']).toBeDefined()
    received = true
    await uploadReady
    await route.fulfill({ json: { quoteUrl: 'https://cart.jlcpcb.com/quote/?homeUploadNum=test-fixture' } })
  })
  await context.route('https://cart.jlcpcb.com/**', route => route.fulfill({ body: 'Test quote' }))
  await page.getByRole('group', { name: 'JLCPCB export guide' }).getByRole('button', { name: '1 Board finish' }).click()
  await page.getByRole('button', { name: 'Resume guide' }).click()
  const pagesBefore = context.pages().length
  const popupEvent = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Send ZIP', exact: true }).click()
  try {
    await expect(page.getByRole('button', { name: 'Retrying…', exact: true })).toBeDisabled()
    expect(context.pages()).toHaveLength(pagesBefore)
    const steps = page.getByRole('group', { name: 'JLCPCB export guide' })
    await page.clock.fastForward(4100)
    await expect(steps.getByRole('button', { name: '2 Full color' })).toHaveAttribute('aria-pressed', 'true')
    await steps.getByRole('button', { name: '1 Board finish' }).click()
    await page.clock.fastForward(4100)
    await expect(steps.getByRole('button', { name: '1 Board finish' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Resume guide' }).click()
    await page.clock.fastForward(4100)
    await expect(steps.getByRole('button', { name: '2 Full color' })).toHaveAttribute('aria-pressed', 'true')
    await page.clock.fastForward(2500)
    await page.screenshot({ path: test.info().outputPath('guide-progress.png') })
  } finally { releaseUpload() }
  const popup = await popupEvent
  await expect(popup).toHaveURL('https://cart.jlcpcb.com/quote/?homeUploadNum=test-fixture')
  expect(received).toBe(true)
  expect(uploadAttempts).toBe(2)
  await expect(page.getByRole('dialog')).toContainText('Opened in JLCPCB')
  await expect(page.getByRole('button', { name: 'Pause guide' })).toBeVisible()
  await popup.close()
  await page.route('**/api/jlcpcb/upload', route => route.fulfill({ status: 400, json: { statusMessage: 'ZIP upload was incomplete.' } }))
  await page.getByRole('button', { name: 'Send ZIP', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('JLCPCB upload failed (HTTP 400): ZIP upload was incomplete.')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled()
  expect(context.pages()).toHaveLength(pagesBefore)

  // Simulate popup blocking. The ready quote stays accessible without re-uploading.
  await page.evaluate(() => { window.open = () => null })
  let fallbackUploads = 0
  await page.route('**/api/jlcpcb/upload', route => {
    fallbackUploads++
    return route.fulfill({ json: { quoteUrl: 'https://cart.jlcpcb.com/quote/?homeUploadNum=blocked-fixture' } })
  })
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  const openQuote = page.getByRole('link', { name: 'Open JLCPCB', exact: true })
  await expect(openQuote).toHaveAttribute('href', 'https://cart.jlcpcb.com/quote/?homeUploadNum=blocked-fixture')
  const manualPopupEvent = page.waitForEvent('popup')
  await openQuote.click()
  const manualPopup = await manualPopupEvent
  await expect(manualPopup).toHaveURL('https://cart.jlcpcb.com/quote/?homeUploadNum=blocked-fixture')
  expect(fallbackUploads).toBe(1)

})
test('older board imports explain the required re-export', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(fixture)
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  await page.getByRole('button', { name: 'Send ZIP', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('This board has no native Gerbers or drill files.')
})

test('exports sharp artwork above native silk while preserving pad clearances', async ({ page }) => {
  await page.addInitScript(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle)
    Object.assign(window, { inkSvg: '' })
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      if (typeof algorithm === 'object' && algorithm.name === 'AES-GCM' && !(window as any).inkSvg) (window as any).inkSvg = new TextDecoder().decode(data)
      return original(algorithm, key, data)
    }
  })
  const square = 'M0,0 L25.4,0 L25.4,25.4 L0,25.4 Z'
  const project = {
    version: 1, side: 'front', silk: true, mask: '#202822', fabrication: false,
    board: { name: 'Overlap test', bounds: { x: 0, y: 0, width: 25.4, height: 25.4 }, outline: square, holes: '',
      layers: { 'front-silkscreen': [square], 'front-mask': ['M12,12 L14,12 L14,14 L12,14 Z'] },
      fabrication: { version: 1, copperLayers: 2, originMm: [0,0], files: Object.fromEntries(Object.entries(nativeFiles()).map(([n,b]) => [n,strFromU8(b)])) } },
    artwork: [{ id: 'pink', name: 'Pink', side: 'front', visible: true, x: 5, y: 5, width: 15, height: 15, rotation: 0,
      source: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 15 15"><path fill="#fc7f9e" d="M0 0H15V15H0Z"/></svg>' }],
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'overlap.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click()
  await download
  const result = await page.evaluate(async () => {
    const svg = new DOMParser().parseFromString((window as any).inkSvg, 'image/svg+xml')
    const image = new Image(); image.src = svg.querySelector('image')!.getAttribute('xlink:href')!; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0)
    const pixel = (mm: number) => [...ctx.getImageData(Math.floor(mm / 25.4 * image.width), Math.floor(mm / 25.4 * image.height), 1, 1).data]
    return { width: image.width, overlap: pixel(8), silk: pixel(2), pad: pixel(13) }
  })
  expect.soft(result.overlap).toEqual([252,127,158,255])
  expect.soft(result.width).toBeGreaterThanOrEqual(1200)
  expect(result.silk).toEqual([255,255,255,255])
  expect(result.pad[3]).toBe(0)
})

test('large boards export at full resolution without exceeding one canvas limit', async ({ page }) => {
  await page.addInitScript(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle)
    Object.assign(window, { largeInk: '' })
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      if (typeof algorithm === 'object' && algorithm.name === 'AES-GCM' && !(window as any).largeInk) (window as any).largeInk = new TextDecoder().decode(data)
      return original(algorithm, key, data)
    }
  })
  const files = unzipSync(packageBytes())
  const manifest = JSON.parse(strFromU8(files['manifest.json']!))
  manifest.board.boundsMm = { x: 0, y: 0, width: 200, height: 200 }
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles({ name: 'large.overprint-board', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) })
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('ZIP downloaded.', { timeout: 15000 })
  const tiles = await page.evaluate(async () => {
    const svg = new DOMParser().parseFromString((window as any).largeInk, 'image/svg+xml')
    return Promise.all([...svg.querySelectorAll('image')].map(async node => {
      const image = new Image(); image.src = node.getAttribute('xlink:href')!; await image.decode()
      return { x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y')), w: Number(node.getAttribute('width')), h: Number(node.getAttribute('height')), pw: image.width, ph: image.height }
    }))
  })
  expect(tiles.length).toBeGreaterThan(1)
  expect(tiles.reduce((sum, tile) => sum + tile.w * tile.h, 0)).toBeCloseTo((200 / .254) ** 2, 5)
  for (const tile of tiles) {
    expect(Math.max(tile.pw, tile.ph)).toBeLessThanOrEqual(4097)
    expect(tile.pw / (tile.w * .254) * 25.4).toBeGreaterThanOrEqual(1199.99)
    expect(tile.ph / (tile.h * .254) * 25.4).toBeGreaterThanOrEqual(1199.99)
  }
  const firstRow = tiles.filter(tile => tile.y === 0)
  for (let i = 1; i < firstRow.length; i++) expect(firstRow[i]!.x).toBeCloseTo(firstRow[i-1]!.x + firstRow[i-1]!.w, 9)

})
