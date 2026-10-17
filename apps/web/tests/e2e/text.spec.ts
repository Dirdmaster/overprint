import { test, expect } from '@playwright/test'
import { demoBoard } from '../fixtures/demoBoard'

test('text stays editable while persisted geometry is frozen local paths', async ({ page }) => {
  const external: string[] = []
  page.on('request', request => { if (!/^(http:\/\/127\.0\.0\.1:|data:|blob:)/.test(request.url())) external.push(request.url()) })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByRole('button', { name: 'Draw text', exact: true }).click()
  const point = await page.locator('svg[role="img"]').evaluate(svg => {
    const p = new DOMPoint(28, 50).matrixTransform((svg.querySelector('g[transform]') as SVGGraphicsElement).getScreenCTM()!)
    return { x: p.x, y: p.y }
  })
  await page.mouse.click(point.x, point.y)
  await page.getByLabel('Text content').fill('Overprint\nPCB')
  await page.getByRole('button', { name: 'Apply text', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Apply text', exact: true })).toBeEnabled()
  await page.getByLabel('Text size (mm)').fill('5')
  await page.getByRole('button', { name: 'Apply text', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Apply text', exact: true })).toBeEnabled()
  const image = page.locator('[data-artwork-layer] image')
  const before = await image.getAttribute('href')
  expect(decodeURIComponent(before!)).toContain('<path')
  expect(decodeURIComponent(before!)).not.toContain('<text')
  await page.getByLabel('Text content').fill('🛠')
  await page.getByRole('button', { name: 'Apply text', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unsupported')
  expect(await image.getAttribute('href')).toBe(before)
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  expect(await page.locator('[data-artwork-layer] image').getAttribute('href')).toBe(before)
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await expect(page.getByLabel('Text content')).toHaveValue('Overprint\nPCB')
  await expect(page.getByLabel('Text size (mm)')).toHaveValue('5')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  const download = await downloading
  await page.getByRole('button', { name: 'Delete Text', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles((await download.path())!)
  expect(await page.locator('[data-artwork-layer] image').getAttribute('href')).toBe(before)
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.screenshot({ path: 'test-results/editable-text-desktop.png' })
  expect(external).toEqual([])
})

test('downloaded manufacturing text is identical after reopening frozen outlines', async ({ page }) => {
  const { createDecipheriv, generateKeyPairSync, privateDecrypt, constants } = await import('node:crypto')
  const { readFileSync } = await import('node:fs')
  const { unzipSync } = await import('fflate')
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  await page.addInitScript(publicKey => {
    const original = crypto.subtle.importKey.bind(crypto.subtle)
    crypto.subtle.importKey = ((format: string, data: BufferSource, algorithm: AlgorithmIdentifier, extractable: boolean, usages: KeyUsage[]) => {
      if (format === 'spki' && typeof algorithm === 'object' && algorithm.name === 'RSA-OAEP') data = new Uint8Array(publicKey)
      return original(format as 'spki', data, algorithm, extractable, usages)
    }) as typeof crypto.subtle.importKey
  }, [...keys.publicKey.export({ format: 'der', type: 'spki' })])
  const board = { name: 'Text output', bounds: { x: 0, y: 0, width: 20, height: 20 }, outline: 'M0 0 L20 0 L20 20 L0 20 Z', holes: '', layers: { 'front-silkscreen': [], 'front-mask': [], 'front-copper': [], 'front-fabrication': [] }, fabrication: { version: 1, copperLayers: 2, originMm: [0, 0], files: Object.fromEntries([...['F_Cu', 'B_Cu', 'F_Mask', 'B_Mask', 'F_Silkscreen', 'B_Silkscreen', 'Edge_Cuts'].map(name => [`fabrication/${name}.gbr`, '%MOMM*%\nM02*\n']), ['fabrication/drill.drl', 'M48\nMETRIC,TZ\n%\nM30\n']]) } }
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'text.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, board, artwork: [], side: 'front', silk: false, mask: '#161616', fabrication: false })) })
  await page.getByRole('button', { name: 'Draw text', exact: true }).click()
  const point = await page.locator('svg[role="img"]').evaluate(svg => {
    const p = new DOMPoint(3, 4).matrixTransform((svg.querySelector('g[transform]') as SVGGraphicsElement).getScreenCTM()!)
    return { x: p.x, y: p.y }
  })
  await page.mouse.click(point.x, point.y)
  await page.getByLabel('Text content').fill('H')
  await page.getByLabel('Text size (mm)').fill('5')
  await page.getByLabel('Text fill').fill('#ff0000')
  await page.getByRole('button', { name: 'Apply text', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Apply text', exact: true })).toBeEnabled()
  const saving = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  const savedPath = (await (await saving).path())!
  const saved = JSON.parse(readFileSync(savedPath, 'utf8'))
  expect(saved.artwork[0].source).toContain('<path')
  expect(saved.artwork[0].source).not.toContain('<text')
  const downloadSvg = async () => {
    await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download ZIP', exact: true }).click()
    const archive = unzipSync(readFileSync((await (await download).path())!))
    const bytes = Buffer.from(archive['Fabrication_ColorfulTopSilkscreen.FCTS']!)
    const unwrap = (offset: number) => privateDecrypt({ key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, bytes.subarray(offset, offset + 256))
    const decipher = createDecipheriv('aes-128-gcm', unwrap(0), unwrap(256))
    decipher.setAuthTag(bytes.subarray(-16))
    const svg = Buffer.concat([decipher.update(bytes.subarray(512, -16)), decipher.final()]).toString()
    await page.keyboard.press('Escape')
    return svg
  }
  const original = await downloadSvg()
  await page.getByLabel('Choose project file').setInputFiles(savedPath)
  const reopened = await downloadSvg()
  expect(reopened).toBe(original)
  const redPixels = await page.evaluate(async source => {
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml')
    const image = new Image()
    image.src = svg.querySelector('image')!.getAttribute('xlink:href')!
    await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, image.width, image.height).data
    let red = 0
    for (let index = 0; index < data.length; index += 4) if (data[index] === 255 && data[index + 1] === 0 && data[index + 2] === 0 && data[index + 3] === 255) red++
    return red
  }, original)
  expect(redPixels).toBeGreaterThan(100)
})
