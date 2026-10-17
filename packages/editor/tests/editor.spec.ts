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

for (const interrupt of ['replace', 'dispose']) {
  test(`checkpoint restore reports cancellation after ${interrupt}`, async ({ page }) => {
    await page.goto('/tests/index.html')
    const result = await page.evaluate(async interrupt => {
      const { controllers, createEditorHistory } = window as any
      const editor = controllers[0]
      const history = createEditorHistory(editor)
      history.checkpoint()
      const pending = history.restore()
      // Let restore start parsing before invalidating its generation.
      await Promise.resolve()
      if (interrupt === 'replace') editor.replaceBoard(editor.getDocument().board)
      else editor.destroy()
      return { applied: await pending, state: history.getState() }
    }, interrupt)
    expect(result.applied).toBe(false)
    expect(result.state.pending).toBe(false)
    expect(result.state.error).toBe('Checkpoint restore was cancelled.')
  })
}

test('shape commands retain physical geometry, bounded lines and editable project metadata', async ({ page }) => {
  await page.goto('/tests/index.html')
  const result = await page.evaluate(async () => {
    const editor = (window as any).controllers[0]
    const definition = { type: 'shape', shape: 'rectangle', width: 12, height: 8, radius: 0, fill: '#ff0000', stroke: '#000000', strokeWidth: 2, lineReverse: false }
    const id = editor.addShape(definition, 3, 4)
    editor.editShape(id, { width: 20 })
    editor.undo()
    const rectangle = editor.getDocument().artwork[0]
    editor.setSide('back')
    editor.addShape({ ...definition, shape: 'line', width: 10, height: 0 }, 5, 5)
    editor.addShape({ ...definition, shape: 'line', width: 0, height: 10 }, 6, 6)
    const document = editor.getDocument()
    await editor.restore(document)
    const restored = editor.getDocument()
    const bad = structuredClone(document)
    bad.artwork[0].drawing.fill = 'url(https://example.com/a.svg)'
    let rejected = false
    try { await editor.restore(bad) } catch { rejected = true }
    const changed = structuredClone(document)
    changed.artwork[0].drawing.width = 99
    let staleRejected = false
    try { await editor.restore(changed) } catch { staleRejected = true }
    return { rectangle, lines: restored.artwork.slice(1), equal: JSON.stringify(document) === JSON.stringify(restored), rejected, staleRejected }
  })
  expect(result.rectangle).toMatchObject({ x: 3, y: 4, width: 14, height: 10, drawing: { width: 12, height: 8 } })
  expect(result.rectangle.source).toContain('viewBox="0 0 14 10"')
  expect(result.rectangle.source).toContain('<rect x="1" y="1" width="12" height="8"')
  expect(result.lines[0]).toMatchObject({ width: 12, height: 2, side: 'back' })
  expect(result.lines[0].source).toContain('x1="1" y1="1" x2="11" y2="1"')
  expect(result.lines[1]).toMatchObject({ width: 2, height: 12, side: 'back' })
  expect(result.equal).toBe(true)
  expect(result.rejected).toBe(true)
  expect(result.staleRejected).toBe(true)
})
