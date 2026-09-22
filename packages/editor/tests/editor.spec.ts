import { test, expect } from '@playwright/test'

test('full editor layers and board properties round-trip through host documents', async ({ page }) => {
  await page.goto('/tests/index.html')
  const first = page.locator('overprint-editor').first()
  await expect(first.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible()
  await expect(first.locator('.embedded-editor')).toHaveCSS('background-image', /linear-gradient/)
  await expect(first.locator('aside > footer')).toHaveCSS('border-top-style', 'solid')
  await first.getByRole('button', { name: 'Add folder', exact: true }).click()
  await first.getByRole('button', { name: 'Add layer', exact: true }).click()
  const doc = await page.evaluate(() => (window as any).controllers[0].getDocument())
  expect(doc.artwork.map((item: any) => item.kind)).toEqual(['folder', 'layer'])
  expect(doc.mask).toBe('#161616')
  expect(await page.evaluate(() => (window as any).controllers[1].getDocument().artwork)).toEqual([])
  await page.evaluate(async doc => { (window as any).controllers[0].undo(); await (window as any).controllers[0].restore(doc) }, doc)
  expect(await page.evaluate(() => (window as any).controllers[0].getDocument())).toEqual(doc)
})

test('keyboard shortcuts stay inside the focused editor and ignore host input', async ({ page }) => {
  await page.goto('/tests/index.html')
  const [first, second] = [page.locator('overprint-editor').nth(0), page.locator('overprint-editor').nth(1)]
  await first.getByRole('button', { name: 'Live paint (K)', exact: true }).click()
  await expect(first.getByRole('button', { name: 'Live paint (K)' })).toHaveAttribute('aria-pressed', 'true')
  await expect(second.getByRole('button', { name: 'Select (V / M)' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('textbox', { name: 'Host input' }).fill('typing')
  await page.keyboard.press('v')
  await expect(first.getByRole('button', { name: 'Live paint (K)' })).toHaveAttribute('aria-pressed', 'true')
  await first.getByRole('img', { name: 'Interaction test front board preview' }).focus()
  await page.keyboard.press('v')
  await expect(first.getByRole('button', { name: 'Select (V / M)' })).toHaveAttribute('aria-pressed', 'true')
})

test('Live Paint hits real geometry inside the shadow root and saves native paint', async ({ page }) => {
  await page.goto('/tests/index.html')
  const first = page.locator('overprint-editor').first()
  await first.getByRole('button', { name: 'Live paint (K)' }).click()
  const point = await first.getByRole('img', { name: 'Interaction test front board preview' }).evaluate(svg => {
    const point = new DOMPoint(10, 10).matrixTransform((svg.querySelector('[data-native-silkscreen]') as SVGGraphicsElement).getScreenCTM()!)
    return { x: point.x, y: point.y }
  })
  await page.mouse.click(point.x, point.y)
  await expect.poll(() => page.evaluate(() => (window as any).controllers[0].getDocument().artwork.some((item: any) => item.nativeSilk))).toBe(true)
  await first.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await page.evaluate(() => (window as any).controllers[0].getDocument().artwork)).toEqual([])
})

test('invalid restore preserves current document and disposal tears down the editor', async ({ page }) => {
  await page.goto('/tests/index.html')
  const result = await page.evaluate(async () => {
    const editor = (window as any).controllers[0]
    const before = editor.getDocument()
    let rejected = false
    try { await editor.restore({ ...before, mask: 'invalid' }) } catch { rejected = true }
    const unchanged = JSON.stringify(editor.getDocument()) === JSON.stringify(before)
    editor.destroy()
    return { rejected, unchanged }
  })
  expect(result).toEqual({ rejected: true, unchanged: true })
  await expect(page.locator('overprint-editor').first().getByRole('region', { name: 'Board workspace' })).toHaveCount(0)
  await expect(page.locator('overprint-editor').nth(1).getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible()
})

test('changing the controller property mounts the new editor state', async ({ page }) => {
  await page.goto('/tests/index.html')
  await page.evaluate(() => {
    document.querySelectorAll('overprint-editor')[1].remove()
  })
  await page.waitForTimeout(20)
  await page.evaluate(() => {
    const controllers = (window as any).controllers
    controllers[1].setSide('back')
    ;(document.querySelector('overprint-editor') as any).controller = controllers[1]
  })
  await expect(page.getByRole('img', { name: 'Interaction test back board preview' })).toBeVisible()
  await page.getByRole('button', { name: 'Add layer', exact: true }).click()
  expect(await page.evaluate(() => (window as any).controllers.map((c: any) => c.getDocument().artwork.length))).toEqual([0, 1])
})

test('the bundled worker imports a PCB and resets artwork without affecting another editor', async ({ page }) => {
  await page.goto('/tests/index.html')
  await page.locator('overprint-editor').first().getByRole('button', { name: 'Add layer', exact: true }).click()
  const source = await (await import('node:fs/promises')).readFile(new URL('../../../apps/web/tests/fixtures/browser-import.kicad_pcb', import.meta.url), 'utf8')
  const result = await page.evaluate(async source => {
    const [first, second] = (window as any).controllers
    const previous = second.getDocument()
    await first.loadBoard(new File([source], 'Imported.kicad_pcb'))
    return { name: first.getDocument().board.name, artwork: first.getDocument().artwork, isolated: JSON.stringify(second.getDocument()) === JSON.stringify(previous) }
  }, source)
  expect(result).toEqual({ name: 'Imported', artwork: [], isolated: true })
})
