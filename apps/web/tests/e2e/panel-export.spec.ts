import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

// Each build starts a fresh CAM worker and loads the local Python runtime.
const camResultTimeout = 40_000

const importCoupon = async (page: Page, name: string) => {
  const [picker] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open project', exact: true }).click(),
  ])
  await picker.setFiles(`tests/fixtures/panels/${name}.overprint`)
  const board = name.replace('coupon-', '')
  await expect(page.getByRole('img', { name: `${board} front board preview`, exact: true })).toBeVisible()
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
const checkColor = async (page: Page, files: Record<string, Uint8Array>, index: number, samples: Sample[]) => {
  const layer = index === 0 ? files['Fabrication_ColorfulTopSilkscreen.FCTS']! : files['Fabrication_ColorfulBottomSilkscreen.FCBS']!
  const registration = strFromU8(files['Fabrication_ColorfulBoardOutlineMark.FCBM']!)
  const gerberMarks = [...registration.matchAll(/^X(-?\d+)Y(-?\d+)D03\*$/gm)]
    .flatMap(mark => [Number(mark[1]), Number(mark[2])].map(value => value / 100_000 / .254))
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
  expect(gerberMarks).toHaveLength(6)
  expect(proof.marks?.split(' ').map(Number)).toEqual(gerberMarks)
  expect(proof.pixels).toEqual(samples.map(sample => sample[2]))
}

test('exports a repeated asymmetric panel directly from an Overprint project', async ({ page }, testInfo) => {
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
  const front = page.getByRole('img', { name: 'Panel front preview' })
  const downloadButton = page.getByRole('button', { name: 'Download ZIP', exact: true })
  await expect(front.locator('use')).toHaveCount(2)
  const columns = page.getByLabel('Columns', { exact: true })
  const rows = page.getByLabel('Rows', { exact: true })
  await columns.fill('1')
  await expect(front.locator('use')).toHaveCount(1)
  await rows.fill('2')
  await expect(page.getByText('40.00 × 79.50 mm · 2 copies')).toBeVisible()
  await expect(downloadButton).toBeDisabled()
  await rows.fill('1')
  await columns.fill('2')
  await expect(page.getByText('67.50 × 46.00 mm · 2 copies')).toBeVisible()
  await page.getByRole('button', { name: /^back$/i }).click()
  await expect(page.getByRole('img', { name: 'Panel back preview' }).locator('use')).toHaveCount(2)
  await expect(downloadButton).toBeEnabled({ timeout: camResultTimeout })
  const download = page.waitForEvent('download')
  await downloadButton.click()
  const zip = await download
  await zip.saveAs(testInfo.outputPath('repeat-panel.zip'))
  const files = unzipSync(readFileSync((await zip.path())!))
  expect(strFromU8(files['Gerber_TopLayer.GTL']!)).toContain('X0041000000Y-0014500000D03')
  expect(strFromU8(files['Drill_PTH_Through.DRL']!)).toContain('X0041.000000Y-014.500000')
  expect(strFromU8(files['Drill_NPTH_Through.DRL']!)).toContain('C0000.600000')
  expect(files['Fabrication_ColorfulBoardOutlineMark.FCBM']).toBeDefined()
  expect(files['Fabrication_ColorfulTopSilkscreen.FCTS']).toBeDefined()
  expect(files['Fabrication_ColorfulBottomSilkscreen.FCBS']).toBeDefined()
  const transparent = [0, 0, 0, 0], green = [21, 123, 48, 255], red = [168, 50, 50, 255]
  await checkColor(page, files, 0, [
    [1, 1, transparent], [9.5, 11.5, green], [13.5, 14.5, transparent], [17, 14, red],
    [37, 11.5, green], [41, 14.5, transparent],
  ])
  await checkColor(page, files, 1, [
    [1, 1, transparent], [17.5, 11.5, green], [13.5, 14.5, transparent], [10, 14, red],
    [45, 11.5, green], [41, 14.5, transparent],
  ])
  expect(offOrigin.filter(url => url.includes('.whl') || url.includes('pyodide'))).toEqual([])

})

test('exports a mixed panel with one individually rotated saved board', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000)
  await captureColorKeys(page)
  await page.goto('/')
  await importCoupon(page, 'coupon-a')
  await importCoupon(page, 'coupon-b')
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await page.getByRole('link', { name: 'New panel', exact: true }).click()
  await page.getByLabel('Add saved project').selectOption({ label: 'coupon-a' })
  await page.getByLabel('Add saved project').selectOption({ label: 'coupon-b' })
  await page.getByLabel('coupon-a copies', { exact: true }).fill('1')
  await page.getByLabel('Routing radius (mm)').fill('1')
  const downloadButton = page.getByRole('button', { name: 'Download ZIP', exact: true })
  const sendButton = page.getByRole('button', { name: 'Send to JLCPCB', exact: true })
  await expect(downloadButton).toBeDisabled()
  await expect(sendButton).toBeDisabled()
  await page.getByRole('checkbox', { name: /same board material/ }).check()
  await page.getByText('Adjust placements', { exact: true }).click()
  await page.getByLabel('Copy 2 rotation').selectOption('180')
  const x = page.getByLabel('Copy 2 X (mm)', { exact: true })
  await x.fill('30')
  await x.press('Tab')
  await expect(page.getByRole('alert')).toContainText('overlap or leave less than', { timeout: camResultTimeout })
  await expect(downloadButton).toBeDisabled()
  await x.fill('35')
  await x.press('Tab')
  await expect(downloadButton).toBeEnabled({ timeout: camResultTimeout })
  await expect(page.getByRole('img', { name: 'Panel front preview' }).locator('use')).toHaveCount(2)
  await expect(page.getByText(/72.50 × 46.00 mm.*2 copies.*2 designs/)).toBeVisible()
  const routedOutline = await page.getByRole('img', { name: 'Panel front preview' })
    .locator('mask path[fill="white"]').getAttribute('d')
  await page.screenshot({ path: testInfo.outputPath('mixed-front.png'), fullPage: true })
  await page.getByRole('button', { name: /^back$/i }).click()
  await expect(page.getByRole('img', { name: 'Panel back preview' }).locator('use')).toHaveCount(2)
  await page.screenshot({ path: testInfo.outputPath('mixed-back.png'), fullPage: true })
  const download = page.waitForEvent('download')
  await downloadButton.click()
  const zip = await download
  await zip.saveAs(testInfo.outputPath('mixed-panel.zip'))
  const files = unzipSync(readFileSync((await zip.path())!))
  const gerber = strFromU8(files['Gerber_BoardOutlineLayer.GKO']!)
  const exported = [...gerber.matchAll(/^X(-?\d+)Y(-?\d+)D0[12]\*$/gm)]
    .map(([, x, y]) => [Number(x), -Number(y) || 0])
  const preview = [...routedOutline!.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)]
    .map(([, x, y]) => [Math.round(Number(x) * 1e6), Math.round(Number(y) * 1e6)])
  expect(exported).toEqual(preview)
  expect(strFromU8(files['Gerber_TopLayer.GTL']!)).toContain('X0057000000Y-0016500000D03')
  expect(strFromU8(files['Gerber_TopSolderMaskLayer.GTS']!)).toContain('X0057000000Y-0016500000D03')
  expect(strFromU8(files['Gerber_TopLayer.GTL']!)).toContain('G36*')
  expect(strFromU8(files['Gerber_TopSolderMaskLayer.GTS']!)).toContain('G36*')
  expect(strFromU8(files['Drill_PTH_Through.DRL']!)).toContain('X0057.000000Y-016.500000')
  const transparent = [0, 0, 0, 0], green = [21, 123, 48, 255], blue = [32, 76, 187, 255]
  await checkColor(page, files, 0, [
    [1, 1, transparent], [9.5, 11.5, green], [57, 16.5, transparent], [60.5, 19.2, green], [53, 16.5, blue], [53, 14.5, transparent],
  ])
  await checkColor(page, files, 1, [
    [1, 1, transparent], [17.5, 11.5, green], [57, 16.5, transparent], [53, 19.2, green], [60.5, 16.5, blue], [53, 14.5, blue],
  ])

  const quoteUrl = 'https://cart.jlcpcb.com/quote/?homeUploadNum=panel-fixture'
  let uploaded: ReturnType<typeof unzipSync> | undefined
  await page.route('**/api/jlcpcb/upload', async route => {
    expect(route.request().headers()['content-type']).toBe('application/zip')
    uploaded = unzipSync(route.request().postDataBuffer()!)
    await route.fulfill({ json: { quoteUrl } })
  })
  await context.route('https://cart.jlcpcb.com/**', route => route.fulfill({ body: 'Panel quote' }))
  await sendButton.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Panel by Customer')
  await expect(dialog).toContainText('Enter 2 designs')
  expect(uploaded).toBeUndefined()
  const quote = page.waitForEvent('popup')
  await dialog.getByRole('button', { name: 'Send ZIP', exact: true }).click()
  await expect(await quote).toHaveURL(quoteUrl)
  expect(uploaded?.['Drill_NPTH_Through.DRL']).toEqual(files['Drill_NPTH_Through.DRL'])
  expect(uploaded?.['Fabrication_ColorfulBottomSilkscreen.FCBS']).toBeDefined()
})

test('pins saved revisions across refresh cancellation, source deletion and workspace restore', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await importCoupon(page, 'coupon-a')
  await importCoupon(page, 'coupon-b')
  await page.goto('/panel')
  await page.getByLabel('Add saved project').selectOption({ label: 'coupon-a' })
  await page.getByLabel('Add saved project').selectOption({ label: 'coupon-b' })
  await page.getByLabel('coupon-a copies', { exact: true }).fill('1')
  await page.getByRole('checkbox', { name: /same board material/ }).check()
  await page.getByText('Adjust placements', { exact: true }).click()
  await page.getByLabel('Copy 2 rotation').selectOption('180')
  await page.getByLabel('Panel name', { exact: true }).fill('Pinned panel')
  await page.getByRole('button', { name: 'Save panel', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Panel saved')

  await page.getByRole('link', { name: 'Back to editor' }).click()
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  const gallery = page.getByRole('region', { name: 'All projects' })
  const source = gallery.getByRole('article', { name: 'coupon-b', exact: true })
  await source.locator('summary').click()
  await source.getByRole('button', { name: 'Rename', exact: true }).click()
  await source.getByLabel('Project name').fill('Changed source B')
  await source.getByRole('button', { name: 'Save', exact: true }).click()
  const renamed = gallery.getByRole('article', { name: 'Changed source B', exact: true })
  await expect(renamed).toBeVisible()
  await page.getByRole('link', { name: 'New panel', exact: true }).click()
  await expect(page).toHaveURL(/\/panel/)
  const saved = page.getByRole('combobox', { name: 'Open saved panel', exact: true })
  await saved.selectOption({ label: 'Pinned panel' })
  await expect(page.getByRole('status')).toContainText('Panel reopened')
  await page.getByText('Adjust placements', { exact: true }).click()
  await expect(page.getByLabel('Copy 2 rotation')).toHaveValue('180')
  await expect(page.getByLabel('Copy 2 X (mm)', { exact: true })).toHaveValue('35')
  await page.getByRole('button', { name: 'Review newer revision' }).click()
  await expect(page.getByText(/Previewing the newer revision of Changed source B/)).toBeVisible({ timeout: camResultTimeout })
  await page.getByRole('button', { name: 'Cancel refresh', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Panel designs' })).toContainText('coupon-b')
  await page.getByRole('button', { name: 'Review newer revision' }).click()
  const apply = page.getByRole('button', { name: 'Apply revision', exact: true })
  await expect(apply).toBeDisabled({ timeout: camResultTimeout })
  await page.getByRole('checkbox', { name: /updated design still uses/ }).check()
  await apply.click()
  await expect(page.getByRole('list', { name: 'Panel designs' })).toContainText('Changed source B')
  // Applying refresh edits the current layout. The last saved version stays pinned.
  await page.getByRole('link', { name: 'Back to editor' }).click()
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await renamed.locator('summary').click()
  await renamed.getByRole('button', { name: 'Delete', exact: true }).click()
  await gallery.getByRole('button', { name: 'Confirm deletion' }).click()
  await expect(renamed).toHaveCount(0)
  const backupEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export everything' }).click()
  const backup = await backupEvent
  await page.getByLabel('Choose workspace backup').setInputFiles((await backup.path())!)
  await expect(page.getByText(/1 saved panel/)).toBeVisible()
  await page.getByRole('button', { name: 'Import backup copies' }).click()
  await expect(page.getByRole('status')).toContainText('Backup imported as copies')
  await page.getByRole('link', { name: 'New panel', exact: true }).click()
  await saved.selectOption({ label: 'Pinned panel restored' })
  await expect(page.getByRole('list', { name: 'Panel designs' })).toContainText('coupon-b')
  await expect(page.getByText(/Source removed. Using pinned revision/)).toBeVisible()
  await expect(page.getByRole('img', { name: 'Panel front preview' })).toBeVisible()
  const downloadButton = page.getByRole('button', { name: 'Download ZIP', exact: true })
  await expect(downloadButton).toBeEnabled({ timeout: camResultTimeout })
  const zipEvent = page.waitForEvent('download')
  await downloadButton.click()
  const zip = unzipSync(readFileSync((await (await zipEvent).path())!))
  expect(strFromU8(zip['Drill_PTH_Through.DRL']!)).toContain('X0057.000000Y-016.500000')
})

test('restores panel edge exclusions from a backup and exports the tab rows shown in the preview', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await importCoupon(page, 'coupon-a')
  await page.getByRole('button', { name: 'Create panel', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Choose tab edges' }).check()
  await page.getByText('Adjust placements', { exact: true }).click()
  await page.getByRole('checkbox', { name: 'Override tab edges for copy 2' }).check()
  const copyTwo = page.getByRole('group', { name: 'Allowed tab edges for copy 2' })
  await copyTwo.getByRole('checkbox', { name: 'Left' }).uncheck()
  const download = page.getByRole('button', { name: 'Download ZIP' })
  await expect(page.getByRole('alert')).toContainText('cannot place right tab', { timeout: camResultTimeout })
  await expect(download).toBeDisabled()
  await copyTwo.getByRole('checkbox', { name: 'Left' }).check()
  await page.getByRole('group', { name: 'Allowed tab edges', exact: true }).getByRole('checkbox', { name: 'Top' }).check()
  await page.getByRole('textbox', { name: 'Panel name' }).fill('Side tabs')
  await page.getByRole('button', { name: 'Save panel', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Panel saved')
  await page.getByRole('link', { name: 'Back to editor' }).click()
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  const backupEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export everything' }).click()
  await page.getByLabel('Choose workspace backup').setInputFiles((await (await backupEvent).path())!)
  await page.getByRole('button', { name: 'Import backup copies' }).click()
  await expect(page.getByRole('status')).toContainText('Backup imported as copies')
  await page.getByRole('link', { name: 'New panel', exact: true }).click()
  await page.getByRole('combobox', { name: 'Open saved panel' }).selectOption({ label: 'Side tabs restored' })
  await expect(page.getByRole('checkbox', { name: 'Choose tab edges' })).toBeChecked()
  await page.getByText('Adjust placements', { exact: true }).click()
  await expect(copyTwo.getByRole('checkbox', { name: 'Left' })).toBeChecked()
  await expect(copyTwo.getByRole('checkbox', { name: 'Top' })).not.toBeChecked()
  await expect(copyTwo.getByRole('checkbox', { name: 'Bottom' })).not.toBeChecked()
  await expect(download).toBeEnabled({ timeout: camResultTimeout })
  const preview = page.getByRole('img', { name: 'Panel front preview' })
  const holes = await preview.locator('mask path[fill="black"]').getAttribute('d')
  expect(holes).toBeTruthy()
  const event = page.waitForEvent('download')
  await download.click()
  const files = unzipSync(readFileSync((await (await event).path())!))
  const drill = strFromU8(files['Drill_NPTH_Through.DRL']!)
  const points = [...drill.matchAll(/^X(-?[\d.]+)Y(-?[\d.]+)$/gm)]
    .map(([, x, y]) => [Number(x), -Number(y)] as const)
  expect(points).toHaveLength(50)
  expect(points.filter(([x, y]) => y === 7.22 && x < 32.5)).toHaveLength(10)
  expect([...new Set(points.filter(([, y]) => y !== 7.22).map(([x]) => x))].sort((a, b) => a - b))
    .toEqual([7.22, 32.78, 34.72, 60.28])
  const centersMatch = await preview.evaluate((_, { holes, points }) => {
    const context = document.createElement('canvas').getContext('2d')!
    const cutouts = new Path2D(holes!)
    return points.every(([x, y]) => context.isPointInPath(cutouts, x, y))
  }, { holes, points })
  expect(centersMatch).toBe(true)
})

test('reopens rounded routing and exports one shared side bridge', async ({ page }) => {
  await page.goto('/')
  await importCoupon(page, 'coupon-a')
  await page.getByRole('button', { name: 'Create panel', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Choose tab edges' }).check()
  await page.getByRole('checkbox', { name: 'Optimize tabs' }).check()
  await page.getByLabel('Routing radius (mm)').fill('1')
  await page.getByLabel('Rail fiducials').selectOption('both')
  await page.getByRole('textbox', { name: 'Panel name' }).fill('Optimized sides')
  await page.getByRole('button', { name: 'Save panel', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Panel saved')
  await page.reload()
  await page.getByRole('combobox', { name: 'Open saved panel' }).selectOption({ label: 'Optimized sides' })
  await expect(page.getByRole('checkbox', { name: 'Optimize tabs' })).toBeChecked()
  await expect(page.getByLabel('Routing radius (mm)')).toHaveValue('1')
  await expect(page.getByLabel('Rail fiducials')).toHaveValue('both')
  const download = page.getByRole('button', { name: 'Download ZIP' })
  await expect(download).toBeEnabled({ timeout: camResultTimeout })
  await expect(page.getByRole('img', { name: 'Panel front preview' }).locator('circle[r="0.5"]')).toHaveCount(3)
  await page.getByRole('button', { name: /^back$/i }).click()
  await expect(page.getByRole('img', { name: 'Panel back preview' }).locator('circle[r="0.5"]')).toHaveCount(3)
  const event = page.waitForEvent('download')
  await download.click()
  const files = unzipSync(readFileSync((await (await event).path())!))
  for (const [layer, diameter] of [
    ['Gerber_TopLayer.GTL', 1], ['Gerber_BottomLayer.GBL', 1],
    ['Gerber_TopSolderMaskLayer.GTS', 2], ['Gerber_BottomSolderMaskLayer.GBS', 2],
  ] as const) {
    const gerber = strFromU8(files[layer]!)
    const aperture = new RegExp(`^%ADD(\\d+)C,${diameter}(?:\\.0+)?\\*%$`, 'm').exec(gerber)?.[1]
    expect(aperture).toBeTruthy()
    const flashes = gerber.slice(gerber.lastIndexOf(`D${aperture}*\n`))
    for (const point of ['X0003850000Y-0003850000', 'X0063650000Y-0003850000', 'X0003850000Y-0042150000']) {
      expect(flashes).toContain(`${point}D03*`)
    }
  }
  const drill = strFromU8(files['Drill_NPTH_Through.DRL']!)
  expect(drill).toContain('C0000.600000')
  const rows = Map.groupBy([...drill.matchAll(/^X([\d.]+)Y(-?[\d.]+)$/gm)], ([, x]) => Number(x))
  expect([...rows.keys()].sort((a, b) => a - b)).toEqual([7.22, 32.78, 34.72, 60.28])
  for (const row of rows.values()) {
    const y = row.map(([, , value]) => -Number(value)).sort((a, b) => a - b)
    expect(y).toHaveLength(5)
    for (let index = 1; index < y.length; index++) {
      expect(y[index]! - y[index - 1]!).toBeCloseTo(0.95, 5)
    }
  }
})
