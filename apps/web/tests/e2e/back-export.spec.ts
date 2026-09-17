import { test, expect } from '@playwright/test'
import { createDecipheriv, generateKeyPairSync, privateDecrypt, constants } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

// Synthetic, original artwork and board geometry: no external PCB assets required.
const nativeFiles = Object.fromEntries([
  ...['F_Cu', 'B_Cu', 'In1_Cu', 'In2_Cu', 'F_Mask', 'B_Mask', 'F_Silkscreen', 'B_Silkscreen', 'Edge_Cuts'].map((name, index) => [
    `fabrication/${name}.gbr`, `G04 Native ${name}*\r\n%FSLAX46Y46*%\r\n%MOMM*%\r\n%ADD10C,0.500000*%\r\nD10*\r\nX${12000000 + index * 1000000}Y-23000000D03*\r\nM02*\r\n`,
  ]),
  ['fabrication/drill-plated.drl', 'M48\r\nMETRIC,TZ\r\nT1C0.600\r\n%\r\nT1\r\nX12.0Y-35.0\r\nM30\r\n'],
  ['fabrication/drill-nonplated.drl', 'M48\nMETRIC,TZ\nT1C1.500\n%\nT1\nX27.0Y-21.0\nM30\n'],
])
const rectangle = (x: number, y: number, w: number, h: number) => `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`
const project = (silk: boolean) => ({
  version: 1, side: 'back', silk, mask: '#202723', fabrication: false,
  board: {
    name: 'Asymmetric rear export', bounds: { x: 10, y: 20, width: 30, height: 20 },
    outline: 'M10,20 L40,20 L40,40 L14,40 L14,37 L10,37 Z',
    holes: rectangle(11, 34, 2, 2),
    layers: {
      'back-silkscreen': [rectangle(35, 22, 2, 2), rectangle(15, 25, 8, 8)],
      'front-silkscreen': [rectangle(25, 22, 2, 2)],
      'back-mask': [rectangle(31, 27, 2, 2)],
      'front-mask': [rectangle(31, 31, 2, 2)],
    },
    fabrication: { version: 1, copperLayers: 4, originMm: [0, 0], files: nativeFiles },
  },
  artwork: [{
    id: 'rear-orientation', name: 'Rotated rear red and blue', side: 'back', visible: true,
    x: 15, y: 26, width: 8, height: 6, rotation: 90,
    source: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6" viewBox="0 0 8 6"><path fill="#ff0000" d="M0 0H2V2H0Z"/><path fill="#0000ff" d="M6 4H8V6H6Z"/></svg>',
  }],
})

for (const silk of [true, false]) test(`downloaded rear artwork has correct orientation and exclusions with native silk ${silk ? 'visible' : 'hidden'}`, async ({ page }, testInfo) => {
  // Substitute only the recipient public key. Inspect the actual downloaded
  // encrypted archive with our private key, without capturing exporter internals.
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicKey = [...keys.publicKey.export({ format: 'der', type: 'spki' })]
  await page.addInitScript((publicKey) => {
    const importKey = crypto.subtle.importKey.bind(crypto.subtle)
    crypto.subtle.importKey = ((format: string, keyData: BufferSource, algorithm: AlgorithmIdentifier, extractable: boolean, usages: KeyUsage[]) => {
      if (format === 'spki' && typeof algorithm === 'object' && algorithm.name === 'RSA-OAEP') keyData = new Uint8Array(publicKey)
      return importKey(format as 'spki', keyData, algorithm, extractable, usages)
    }) as typeof crypto.subtle.importKey
  }, publicKey)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'asymmetric.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project(silk))) })
  await expect(page.getByRole('img', { name: 'Asymmetric rear export back board preview' })).toBeVisible()
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click()
  const archive = unzipSync(readFileSync((await (await downloadEvent).path())!))

  for (const [name, original] of Object.entries(nativeFiles)) {
    const exported = strFromU8(archive[name.slice(12)]!)
    if (name.endsWith('.drl')) expect(exported, name).toBe(original)
    else {
      const native = exported.split('G04 Overprint compatibility export from KiCad*\n')[1]!
      if (!silk && name.endsWith('_Silkscreen.gbr')) {
        expect(native).toContain('KiCad silkscreen hidden in Overprint')
        expect(native).not.toContain('D03*')
      } else expect(native, name).toBe(original)
    }
  }
  const decryptSvg = (name: string) => {
    const bytes = Buffer.from(archive[name]!)
    const unwrap = (start: number) => privateDecrypt({ key: keys.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, bytes.subarray(start, start + 256))
    const decipher = createDecipheriv('aes-128-gcm', unwrap(0), unwrap(256))
    decipher.setAuthTag(bytes.subarray(-16))
    return Buffer.concat([decipher.update(bytes.subarray(512, -16)), decipher.final()]).toString()
  }
  const rear = decryptSvg('Fabrication_ColorfulBottomSilkscreen.FCBS')
  const result = await page.evaluate(async ({ rear }) => {
    const svg = new DOMParser().parseFromString(rear, 'image/svg+xml')
    const embedded = new Image()
    embedded.src = svg.querySelector('image')!.getAttribute('xlink:href')!
    await embedded.decode()
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rear)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 1500; canvas.height = 1000
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    // Coordinates below are millimetres in the finished rear view, not native
    // top-view coordinates. Literal expected points were worked out separately.
    const at = (x: number, y: number) => [...ctx.getImageData((x - 10) * 50, (y - 20) * 50, 1, 1).data]
    return {
      pixels: {
        red: at(29, 32), blue: at(33, 26),
        rearSilk: at(14, 23), frontSilkLocation: at(24, 23),
        rearMask: at(18, 28), frontMaskLocation: at(18, 32),
        hole: at(38, 35), notch: at(38, 39), solidCorner: at(12, 39),
      },
      embeddedWidth: embedded.width, embeddedHeight: embedded.height,
      image: canvas.toDataURL('image/png').split(',')[1]!,
    }
  }, { rear })
  expect(result.embeddedWidth).toBe(1418)
  expect(result.embeddedHeight).toBe(945)
  expect(result.pixels).toEqual({
    red: [255, 0, 0, 255], blue: [0, 0, 255, 255],
    rearSilk: silk ? [255, 255, 255, 255] : [32, 39, 35, 255],
    frontSilkLocation: [32, 39, 35, 255],
    rearMask: [0, 0, 0, 0], frontMaskLocation: [32, 39, 35, 255],
    hole: [0, 0, 0, 0], notch: [0, 0, 0, 0], solidCorner: [32, 39, 35, 255],
  })
  await testInfo.attach('rear-color-output.svg', { body: rear, contentType: 'image/svg+xml' })
  await testInfo.attach('rear-color-output.png', { body: Buffer.from(result.image, 'base64'), contentType: 'image/png' })
})
