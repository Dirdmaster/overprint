import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { demoBoard } from '../fixtures/demoBoard'
import { defaultStrokeText, renderText } from '../../app/utils/artworkText'

const open = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
}
const change = async (page: Page, name: string, value: string) => {
  const control = page.getByRole('spinbutton', { name, exact: true })
  await control.fill(value)
  await control.press('Tab')
}
const save = async (page: Page) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'))
}

// Compatibility coverage for projects saved by the earlier stroke-text implementation.
const openLegacyText = async (page: Page) => {
  const project = await save(page), generated = renderText(defaultStrokeText), b = project.board.bounds
  project.artwork.push({ ...generated, id: `legacy-${project.artwork.length}`, name: 'Text', side: project.side, x: b.x + (b.width - generated.width) / 2, y: b.y + (b.height - generated.height) / 2, rotation: 0, visible: true })
  await page.getByLabel('Choose project file').setInputFiles({ name: 'legacy.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.locator(`[data-artboard-layers="${project.side}"]`).getByRole('button', { name: 'Text', exact: true }).click()
}

test('editable text keeps outlined geometry, typography and history after save/reopen', async ({ page }) => {
  await open(page)
  await openLegacyText(page)
  const content = page.getByRole('textbox', { name: 'Text content', exact: true })
  await content.fill('OVERPRINT\n3.3V • GND')
  await content.press('Tab')
  await change(page, 'Font size (mm)', '4')
  await change(page, 'Stroke width (mm)', '0.5')
  await change(page, 'Letter spacing (mm)', '0.3')
  await page.getByRole('combobox', { name: 'Text alignment', exact: true }).selectOption('center')
  await page.getByRole('combobox', { name: 'Text font', exact: true }).selectOption('newstroke-mono')
  await page.getByRole('checkbox', { name: 'Italic text', exact: true }).check()
  const project = await save(page)
  const item = project.artwork[0]
  expect(item.text).toMatchObject({ content: 'OVERPRINT\n3.3V • GND', size: 4, stroke: 0.5, tracking: 0.3, align: 'center', font: 'newstroke-mono', italic: true })
  expect(item.source).toContain('<path')
  expect(item.source).not.toMatch(/<text|<font|href/)
  await change(page, 'Artwork width', String(item.width / 2))
  await expect(page.getByLabel('Text measurements')).toContainText('Stroke after scaling: 0.250 mm')
  expect((await save(page)).artwork[0].source).toBe(item.source)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByLabel('Text measurements')).toContainText('Stroke after scaling: 0.500 mm')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Italic text', exact: true })).not.toBeChecked()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Italic text', exact: true })).toBeChecked()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await expect(content).toHaveValue(item.text.content)
  expect((await save(page)).artwork[0]).toEqual(item)
  // Reopen the downloaded, portable project, rather than relying only on autosave.
  await page.getByLabel('Choose project file').setInputFiles({ name: 'text.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await expect(content).toHaveValue(item.text.content)
  await page.screenshot({ path: 'test-results/editable-text-desktop.png', fullPage: true })
})

test('legacy projects keep readable text on the back in the shared canvas without changing the front', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await openLegacyText(page)
  const back = page.locator('[data-board-side="back"]')

  await expect(page.getByRole('textbox', { name: 'Text content', exact: true })).toHaveValue('Text')
  const project = await save(page)
  expect(project.side).toBe('back')
  expect(project.artwork).toHaveLength(1)
  expect(project.artwork[0].side).toBe('back')
  const image = back.locator('[data-artwork-layer] image')
  await expect(image).toHaveAttribute('transform', /scale\(-1 1\)/)
  await expect(page.locator('[data-board-side="front"] [data-artwork-layer] image')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Text content', exact: true }).focus()
  await page.keyboard.type('t')
  await expect(page.getByRole('button', { name: 'Select (V)', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('invalid edits and forged text metadata preserve current artwork; conversion is undoable', async ({ page }) => {
  await open(page)
  await openLegacyText(page)
  const before = await save(page)
  await change(page, 'Stroke width (mm)', '0')
  await expect(page.getByRole('alert')).toContainText('positive stroke')
  expect((await save(page)).artwork).toEqual(before.artwork)
  const bad = structuredClone(before)
  bad.artwork[0].text.content = 'Different outlines'
  await page.getByLabel('Choose project file').setInputFiles({ name: 'forged.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) })
  await expect(page.getByRole('status')).toContainText('does not match')
  expect((await save(page)).artwork).toEqual(before.artwork)
  await page.getByRole('button', { name: 'Convert text to outlines', exact: true }).click()
  const converted = await save(page)
  expect(converted.artwork[0].text).toBeUndefined()
  expect(converted.artwork[0].source).toBe(before.artwork[0].source)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Text content', exact: true })).toHaveValue('Text')
})

test('text editing fits a narrow screen and size shortcuts stay inside text fields', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await openLegacyText(page)
  const content = page.getByRole('textbox', { name: 'Text content', exact: true })
  await content.fill('PCB LABEL')
  await content.press('Tab')
  await content.fill('V M K T')
  await content.press('Tab')
  await expect(page.getByRole('button', { name: 'Select (V)', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await content.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/editable-text-mobile.png', fullPage: true })
})

test('manufacturing ZIP renders bundled text on both sides without a browser font', async ({ page }) => {
  await page.addInitScript(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle)
    Object.assign(window, { textExports: [] })
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      if (typeof algorithm === 'object' && algorithm.name === 'AES-GCM') (window as any).textExports.push(new TextDecoder().decode(data))
      return encrypt(algorithm, key, data)
    }
  })
  const native = Object.fromEntries([
    ...['F_Cu', 'B_Cu', 'F_Mask', 'B_Mask', 'F_Silkscreen', 'B_Silkscreen', 'Edge_Cuts'].map(name => [`fabrication/${name}.gbr`, '%MOMM*%\nM02*\n']),
    ['fabrication/drill.drl', 'M48\nM30\n'],
  ])
  const project = { version: 1, side: 'front', silk: false, mask: '#202723', fabrication: false, artwork: [], board: {
    name: 'Text export', bounds: { x: 10, y: 20, width: 40, height: 20 }, outline: 'M10 20 L50 20 L50 40 L10 40 Z', holes: '', layers: {}, fabrication: { version: 1, copperLayers: 2, originMm: [0, 0], files: native },
  } }
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'export.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  for (const side of ['Front', 'Back']) {
    await page.getByRole('button', { name: side, exact: true }).click()
    await openLegacyText(page)
    const content = page.getByRole('textbox', { name: 'Text content', exact: true })
    await content.fill('F'); await content.press('Tab')
    await change(page, 'Font size (mm)', '4')
    await change(page, 'Stroke width (mm)', '0.4')
  }
  await page.getByRole('button', { name: 'Send to JLCPCB', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ZIP', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/\.zip$/)
  const counts = await page.evaluate(async () => {
    const results: number[] = []
    // Inspect the actual color SVGs passed to encryption by the ZIP exporter.
    for (const source of (window as any).textExports.filter((svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('image'))) {
      const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source); await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 400
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 800, 400)
      const pixels = context.getImageData(0, 0, 800, 400).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 200 && pixels[i + 1]! > 200 && pixels[i + 2]! > 200) count++
      results.push(count)
    }
    return results
  })
  expect(counts).toHaveLength(2)
  expect(counts.every(count => count > 500)).toBe(true)
  expect(Math.abs(counts[0]! - counts[1]!)).toBeLessThan(20)
})
