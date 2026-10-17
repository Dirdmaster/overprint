import { test, expect } from '@playwright/test'
import { demoBoard } from '../fixtures/demoBoard'
const graphic = { name: 'mark.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path d="M0 0H20L0 10Z" fill="#ff0000"/></svg>') }
test('saves a composition and places independent copies and pinned linked instances', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByLabel('Choose SVG graphic').setInputFiles(graphic)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Composition name', { exact: true }).fill('Brand')
  await page.getByRole('button', { name: 'Save selection', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Brand', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/library-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/library-mobile.png' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('button', { name: 'Place linked Brand', exact: true }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(2)
  await page.getByRole('button', { name: 'Place copy Brand', exact: true }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByRole('button', { name: 'Brand (linked)', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Detach instance', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Detach instance', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Brand (linked)', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Brand (linked)', exact: true })).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(3)
})

import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
const downloadProject = async (page: Page) => {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save project', exact: true }).click()
  return JSON.parse(readFileSync((await (await pending).path())!, 'utf8'))
}
const editNumber = async (page: Page, key: string, value: number) => { const input = page.getByLabel(`Artwork ${key}`, { exact: true }); await input.fill(String(value)); await input.press('Tab') }
const board = { name: 'Library board', bounds: { x: 0, y: 0, width: 60, height: 60 }, outline: 'M0 0L60 0L60 60L0 60Z', holes: '', layers: {} }
const front = { id: 'front-mark', name: 'Front mark', side: 'front', source: graphic.buffer.toString(), x: 10, y: 15, width: 20, height: 10, rotation: 30, visible: true }
const back = { ...front, id: 'back-mark', name: 'Back mark', side: 'back', x: 18, y: 20, width: 12, height: 6, rotation: -20 }
const imported = { version: 1, side: 'front', silk: false, mask: '#202723', fabrication: false, board, artwork: [front, back] }
const importComposition = async (page: Page, project = imported) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open project', exact: true }).click()
  await page.getByLabel('Choose project file').setInputFiles({ name: 'library.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await expect(page.getByRole('status')).toContainText('Project opened')
}

test('cross-side linked transforms, detach and downloaded snapshots preserve asymmetric artwork without its library', async ({ page }) => {
  await importComposition(page)
  await page.getByRole('button', { name: 'Front mark', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Composition name', { exact: true }).fill('Both sides')
  await page.getByLabel('Capture Back mark back').check()
  await page.getByRole('button', { name: 'Save selection', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Both sides', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Place linked Both sides', exact: true }).click()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByRole('button', { name: 'Both sides (linked)', exact: true }).click()
  const initial = await downloadProject(page)
  const bounds = initial.artwork.find((item: any) => item.library).library.snapshot.bounds
  await editNumber(page, 'x', bounds.x); await editNumber(page, 'y', bounds.y)
  const linked = await downloadProject(page)
  // Render public downloaded geometry through the same SVG image contract used by canvas/export.
  const difference = await page.evaluate(async ({ originals, wrappers }) => {
    const render = async (artwork: any[], side: string) => {
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 600
      const ctx = canvas.getContext('2d')!; ctx.scale(10, 10)
      for (const item of artwork.filter(item => item.side === side)) {
        const image = new Image(); image.src = `data:image/svg+xml,${encodeURIComponent(item.source)}`; await image.decode()
        ctx.save(); ctx.translate(item.x + item.width / 2, item.y + item.height / 2); ctx.rotate(item.rotation * Math.PI / 180)
        if (side === 'back') ctx.scale(-1, 1)
        ctx.drawImage(image, -item.width / 2, -item.height / 2, item.width, item.height); ctx.restore()
      }
      return ctx.getImageData(0, 0, 600, 600).data
    }
    const result: number[] = []
    for (const side of ['front', 'back']) {
      const a = await render(originals, side), b = await render(wrappers, side)
      let difference = 0; for (let i = 0; i < a.length; i++) difference += Math.abs(a[i]! - b[i]!)
      result.push(difference / a.length)
    }
    return result
  }, { originals: imported.artwork, wrappers: linked.artwork.filter((item: any) => item.library) })
  expect(difference[0]).toBeLessThan(0.2); expect(difference[1]).toBeLessThan(0.2)
  await editNumber(page, 'x', 30); await editNumber(page, 'rotation', 45)
  const transformed = await downloadProject(page)
  expect(transformed.artwork.filter((item: any) => item.library).map((item: any) => [item.x, item.rotation])).toEqual([[30, 45], [30, 45]])
  await page.getByRole('button', { name: 'Detach instance', exact: true }).click()
  const detached = await downloadProject(page)
  expect(detached.artwork).toHaveLength(4)
  expect(detached.artwork.every((item: any) => !item.library)).toBe(true)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.keyboard.press('Control+s'); await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Delete library Both sides', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Delete library composition' })).toContainText('Placed snapshots remain')
  await page.getByRole('button', { name: 'Delete composition', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Both sides', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.reload(); await expect(page.locator('[data-artwork-layer] image')).toHaveCount(2)
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page.locator('[data-artwork-layer] image')).toHaveCount(2)
  const reloaded = await downloadProject(page)
  expect(reloaded.artwork.filter((item: any) => item.library)).toHaveLength(2)
  await page.getByRole('button', { name: 'Both sides (linked)', exact: true }).click()
  await page.getByRole('button', { name: 'Detach instance', exact: true }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(2)
})

test('revisions stay pinned until explicit preview and apply, with undo and independent copies', async ({ page }) => {
  await importComposition(page, { ...imported, artwork: [front] })
  await page.getByRole('button', { name: 'Front mark', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Composition name', { exact: true }).fill('Logo')
  await page.getByRole('button', { name: 'Save selection', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Logo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Place linked Logo', exact: true }).click()
  await page.getByRole('button', { name: 'Place copy Logo', exact: true }).click()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByLabel('Choose SVG graphic').setInputFiles({ ...graphic, name: 'blue.svg', buffer: Buffer.from(graphic.buffer.toString().replace('#ff0000', '#0000ff')) })
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Save new revision of Logo', exact: true }).click()
  await expect(page.getByText('2 revisions', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByRole('button', { name: 'Logo (linked)', exact: true }).click()
  const pinned = await downloadProject(page)
  expect(pinned.artwork.find((item: any) => item.library).source).toContain('#ff0000')
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Preview library update' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel update', exact: true }).click()
  expect((await downloadProject(page)).artwork.find((item: any) => item.library).source).toContain('#ff0000')
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click()
  await page.getByRole('button', { name: 'Apply update', exact: true }).click()
  const updated = await downloadProject(page)
  expect(updated.artwork.find((item: any) => item.library).source).toContain('#0000ff')
  expect(updated.artwork.filter((item: any) => !item.library && item.source.includes('#ff0000'))).toHaveLength(2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await downloadProject(page)).artwork.find((item: any) => item.library).source).toContain('#ff0000')
})


test('invalid linked snapshots cannot replace the current project', async ({ page }) => {
  await importComposition(page)
  const malformed = { ...imported, artwork: [{ ...front, library: { instanceId: 'broken', assetId: 'asset', revisionId: 'revision', snapshot: { bounds: { x: 0, y: 0, width: 20, height: 10 }, artwork: [{ ...front, library: {} }] } } }] }
  await page.getByLabel('Choose project file').setInputFiles({ name: 'invalid.overprint', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) })
  await expect(page.getByText('Invalid library snapshot.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Front mark', exact: true })).toBeVisible()
  const saved = await downloadProject(page)
  expect(saved.artwork).toHaveLength(2)
  expect(saved.artwork.every((item: any) => !item.library)).toBe(true)
})

test('library quota failure leaves the composition intact and allows retry', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'libraries' && !(window as any).libraryQuotaRecovered) throw new DOMException('Full', 'QuotaExceededError')
      return original.apply(this, args)
    }
  })
  await importComposition(page)
  await page.getByRole('button', { name: 'Front mark', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Composition name', { exact: true }).fill('Recovery')
  await page.getByRole('button', { name: 'Save selection', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Composition library' })).toContainText('Could not save the library')
  await expect(page.getByRole('heading', { name: 'Recovery', exact: true })).toHaveCount(0)
  await page.evaluate(() => { (window as any).libraryQuotaRecovered = true })
  await page.getByRole('button', { name: 'Save selection', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Recovery', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  expect((await downloadProject(page)).artwork).toHaveLength(2)
})


test('portable linked snapshots normalize SVG metadata before detachment', async ({ page }) => {
  const item = { ...front, rotation: 0, source: front.source.replace('<path ', '<metadata><private-note>discard</private-note></metadata><path ') }
  const snapshot = { bounds: { x: 10, y: 15, width: 20, height: 10 }, artwork: [item] }
  const linked = { ...item, id: 'linked', name: 'Portable link', library: { instanceId: 'instance', assetId: 'missing', revisionId: 'revision', snapshot } }
  await importComposition(page, { ...imported, artwork: [linked] } as any)
  await page.getByRole('button', { name: 'Portable link', exact: true }).click()
  await page.getByRole('button', { name: 'Detach instance', exact: true }).click()
  const saved = await downloadProject(page)
  expect(saved.artwork[0].source).not.toContain('metadata')
  expect(saved.artwork[0].source).toContain('#ff0000')
})

test('library dialogs contain keyboard focus and restore it without editing the canvas', async ({ page }) => {
  await importComposition(page, { ...imported, artwork: [front] })
  await page.getByRole('button', { name: 'Front mark', exact: true }).click()
  const trigger = page.getByRole('button', { name: 'Library', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Composition library', exact: true })
  await expect(dialog.getByRole('button', { name: 'Close library' })).toBeFocused()
  await page.keyboard.press('Delete')
  await page.keyboard.press('t')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab')
    await expect.poll(() => dialog.evaluate(element => document.activeElement === document.body || element.contains(document.activeElement))).toBe(true)
  }
  await page.getByLabel('Composition name', { exact: true }).fill('Keyboard')
  await dialog.getByRole('button', { name: 'Save selection', exact: true }).click()
  const deleteTrigger = dialog.getByRole('button', { name: 'Delete library Keyboard' })
  await deleteTrigger.click()
  const deletion = page.getByRole('dialog', { name: 'Delete library composition', exact: true })
  await expect(deletion.getByRole('button', { name: 'Cancel deletion' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(deletion).not.toBeVisible()
  await expect(deleteTrigger).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
})
