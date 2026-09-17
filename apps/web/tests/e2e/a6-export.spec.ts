import { test, expect } from '@playwright/test'

const project = (width: number, height: number) => ({
  version: 1, side: 'front', silk: true, mask: '#345678', fabrication: false, artwork: [],
  board: { name: 'Print size test', bounds: { x: 0, y: 0, width, height },
    outline: `M0,0 L${width},0 L${width},${height} L0,${height} Z`, holes: '', layers: {},
    fabrication: { version: 1, copperLayers: 2, originMm: [0,0], files: Object.fromEntries([
      ...['F_Cu','B_Cu','F_Mask','B_Mask','F_Silkscreen','B_Silkscreen','Edge_Cuts'].map(n => [`fabrication/${n}.gbr`, '%MOMM*%\nM02*\n']),
      ['fabrication/drill.drl','M48\nM30\n'],
    ]) },
  },
})

test('A6 downloads both sides at full 1200 DPI', async ({ page }) => {
  await page.addInitScript(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle)
    Object.assign(window, { colourEnvelopes: [] })
    crypto.subtle.encrypt = async (algorithm,key,data) => {
      if (typeof algorithm === 'object' && algorithm.name === 'AES-GCM') {
        (window as unknown as { colourEnvelopes: string[] }).colourEnvelopes.push(new TextDecoder().decode(data))
      }
      return encrypt(algorithm,key,data)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name:'Open project',exact:true }).click()
  await page.getByLabel('Choose project file').setInputFiles({name:'a6.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project(105,148)))})
  await page.getByRole('button', {name:'Send to JLCPCB',exact:true}).click()
  const download = page.waitForEvent('download', { timeout: 10000 })
  await page.getByRole('button', {name:'Download ZIP',exact:true}).click()
  await download
  const sizes = await page.evaluate(async () => Promise.all(
    (window as unknown as { colourEnvelopes: string[] }).colourEnvelopes.slice(0,2).map(async source => {
      const doc = new DOMParser().parseFromString(source,'image/svg+xml')
      const image = new Image(); image.src = doc.querySelector('image')!.getAttribute('xlink:href')!; await image.decode()
      return [image.width,image.height]
    }),
  ))
  expect(sizes).toEqual([[4961,6993],[4961,6993]])
})

// Tiling supports boards above the old single-canvas limits; reject only
// boards above the total 256 MP budget (square and wide aspect ratios).
for (const [width,height] of [[400,400],[600,200]]) test(`reject oversized ${width} x ${height} mm`, async ({page}) => {
  await page.goto('/')
  await page.getByRole('button',{name:'Open project',exact:true}).click()
  await page.getByLabel('Choose project file').setInputFiles({name:'oversized.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project(width!,height!)))})
  await page.getByRole('button',{name:'Send to JLCPCB',exact:true}).click()
  await page.getByRole('button',{name:'Download ZIP',exact:true}).click()
  await expect(page.getByText(/exceeds the 256 megapixel color export limit at 1200 DPI/)).toBeVisible()
})
