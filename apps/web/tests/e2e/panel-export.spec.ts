import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

const importCoupon = async (page: Page, name: string) => {
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open project', exact: true }).click(),
  ])
  await picker.setFiles(`tests/fixtures/panels/${name}.overprint`)
  await expect(page.getByRole('status')).toContainText('Project opened')
}

const captureColorKeys = async (page: Page) => {
  await page.addInitScript(() => {
    const importKey = crypto.subtle.importKey.bind(crypto.subtle)
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle)
    const keys: CryptoKey[] = [], vectors: Uint8Array[] = []
    Object.assign(window, { panelColorKeys: keys, panelColorVectors: vectors })
    crypto.subtle.encrypt = (algorithm, key, data) => {
      if (typeof algorithm === 'object' && algorithm.name === 'AES-GCM') {
        vectors.push(new Uint8Array((algorithm as AesGcmParams).iv as Uint8Array))
      }
      return encrypt(algorithm, key, data)
    }
    crypto.subtle.importKey = (async (...args: Parameters<typeof importKey>) => {
      if (args[0] === 'raw' && args[2] === 'AES-GCM') {
        keys.push(await importKey('raw', args[1] as BufferSource, 'AES-GCM', false, ['decrypt']))
      }
      return importKey(...args)
    }) as typeof crypto.subtle.importKey
  })
}

type Sample = [number, number, number[]]
const checkColor = async (page: Page, layer: Uint8Array, index: number, samples: Sample[]) => {
  const proof = await page.evaluate(async ({ layer, index, samples }) => {
    const { panelColorKeys, panelColorVectors } = window as unknown as {
      panelColorKeys: CryptoKey[]; panelColorVectors: Uint8Array[]
    }
    const bytes = Uint8Array.from(layer)
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(panelColorVectors[index]!) }, panelColorKeys[index]!, bytes.slice(512))
    const svg = new TextDecoder().decode(data)
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
    const [x, y, width, height] = root.getAttribute('viewBox')!.split(' ').map(n => Number(n) * .254) as [number, number, number, number]
    const image = new Image()
    image.src = 'data:image/svg+xml,' + encodeURIComponent(svg)
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * 12)
    canvas.height = Math.round(height * 12)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return {
      marks: root.getAttribute('mark-points'),
      pixels: samples.map(([px, py]) => {
        const sideX = index === 1 ? 2 * x + width - px : px
        return [...ctx.getImageData(Math.floor((sideX - x) * 12), Math.floor((py - y) * 12), 1, 1).data]
      }),
    }
  }, { layer: [...layer], index, samples })
  expect(proof.marks?.split(' ')).toHaveLength(6)
  expect(proof.pixels).toEqual(samples.map(sample => sample[2]))
}

test('exports a repeated asymmetric panel directly from an Overprint project', async ({ page }) => {
  test.setTimeout(90_000)
  const offOrigin: string[] = []
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:') && !request.url().startsWith('data:')) offOrigin.push(request.url())
  })
  await captureColorKeys(page)
  await page.goto('/')
  await importCoupon(page, 'coupon-a')
  await page.getByRole('button', { name: 'Create panel', exact: true }).click()
  await expect(page.getByText('67.50 × 46.00 mm · 2 copies')).toBeVisible()
  await page.getByRole('button', { name: 'Build preview', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Panel front preview' })).toBeVisible({ timeout: 40_000 })
  await page.getByRole('button', { name: /^back$/i }).click()
  await expect(page.getByRole('img', { name: 'Panel back preview' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click()
  const files = unzipSync(readFileSync((await (await download).path())!))
  expect(strFromU8(files['Gerber_TopLayer.GTL']!)).toContain('X0041000000Y-0014500000D03')
  expect(strFromU8(files['Drill_PTH_Through.DRL']!)).toContain('X0041.000000Y-014.500000')
  expect(strFromU8(files['Drill_NPTH_Through.DRL']!)).toContain('C0000.500000')
  expect(files['Fabrication_ColorfulBoardOutlineMark.FCBM']).toBeDefined()
  expect(files['Fabrication_ColorfulTopSilkscreen.FCTS']).toBeDefined()
  expect(files['Fabrication_ColorfulBottomSilkscreen.FCBS']).toBeDefined()
  const transparent = [0, 0, 0, 0], green = [21, 123, 48, 255], red = [168, 50, 50, 255]
  await checkColor(page, files['Fabrication_ColorfulTopSilkscreen.FCTS']!, 0, [
    [1, 1, transparent], [9.5, 11.5, green], [13.5, 14.5, transparent], [17, 14, red],
    [37, 11.5, green], [41, 14.5, transparent],
  ])
  await checkColor(page, files['Fabrication_ColorfulBottomSilkscreen.FCBS']!, 1, [
    [1, 1, transparent], [17.5, 11.5, green], [13.5, 14.5, transparent], [10, 14, red],
    [45, 11.5, green], [41, 14.5, transparent],
  ])
  expect(offOrigin.filter(url => url.includes('.whl') || url.includes('pyodide'))).toEqual([])
})
