import { test, expect } from '@playwright/test'
import { componentBoard } from '../../../apps/web/tests/fixtures/componentBoard'

test('independent parts share tools, layers, side and history without affecting another editor', async ({ page }) => {
  await page.goto('/tests/index.html?parts')
  const canvas = page.locator('overprint-canvas')
  const toolbar = page.locator('overprint-toolbar')
  const layers = page.locator('overprint-layers')
  await expect(canvas.getByRole('toolbar')).toHaveCount(0)
  await expect(canvas.getByRole('complementary')).toHaveCount(0)
  await layers.getByRole('button', { name: 'Add folder', exact: true }).click()
  await layers.getByRole('button', { name: 'Add layer', exact: true }).click()
  await expect(layers.getByRole('button', { name: 'Layer 1', exact: true })).toBeVisible()
  await expect(page.locator('overprint-editor').getByRole('button', { name: 'Layer 1', exact: true })).toHaveCount(0)
  await layers.getByRole('button', { name: 'Layer 1', exact: true }).press('ControlOrMeta+z')
  await expect(layers.getByRole('button', { name: 'Layer 1', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Custom paint tool' }).click()
  await expect(toolbar.getByRole('button', { name: 'Live paint (K)' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#custom-state')).toHaveText('paint')
  await canvas.getByRole('img', { name: 'Interaction test front board preview' }).focus()
  await page.keyboard.down('Space')
  await expect(page.locator('#custom-state')).toHaveText('hand')
  await page.keyboard.up('Space')
  await expect(page.locator('#custom-state')).toHaveText('paint')
  await page.locator('overprint-view-controls').getByRole('button', { name: 'Back', exact: true }).click()
  await expect(canvas.getByRole('img', { name: 'Interaction test back board preview' })).toBeVisible()
  await expect(page.locator('overprint-editor').getByRole('img', { name: 'Interaction test front board preview' })).toBeVisible()
})

test('CSS parts and inherited tokens customize supplied controls', async ({ page }) => {
  await page.goto('/tests/index.html?parts')
  const toolbar = page.locator('overprint-toolbar')
  await expect(toolbar.getByRole('toolbar')).toHaveCSS('flex-direction', 'row')
  await expect(toolbar.getByRole('button', { name: 'Select (V / M)' })).toHaveCSS('background-color', 'rgb(18, 52, 86)')
  await page.locator('overprint-zoom-controls').getByRole('button', { name: 'Zoom in' }).click()
  expect(await page.evaluate(() => (window as any).controllers[0].getState().zoom)).toBeCloseTo(1.2)
  await page.locator('overprint-zoom-controls').getByRole('button', { name: 'Fit', exact: true }).click()
  expect(await page.evaluate(() => (window as any).controllers[0].getState().zoom)).toBe(1)
})

test('custom controls validate edits and share the actual document and undo history', async ({ page }) => {
  await page.goto('/tests/index.html?parts')
  const result = await page.evaluate(() => {
    const editor = (window as any).controllers[0]
    const id = editor.createLayer('layer')
    editor.renameLayer(id, 'Custom layer')
    editor.setLayerVisibility(id, false)
    editor.setPaintColor('#f00')
    editor.setMaskColor('#111')
    editor.setVisibility('silkscreen', false)
    const state = editor.getState()
    const before = JSON.stringify(editor.getDocument())
    let rejected = 0
    for (const run of [() => editor.setTool('bad'), () => editor.setMaskColor('invalid'), () => editor.zoomBy(-1), () => editor.removeLayer('missing')]) {
      try { run() } catch { rejected++ }
    }
    const unchanged = before === JSON.stringify(editor.getDocument())
    editor.undo()
    return { state, rejected, unchanged, visibleAfterUndo: editor.getState().layers[0].visible }
  })
  expect(result.state).toMatchObject({ paintColor: '#ff0000', maskColor: '#111111', silk: false, layers: [{ name: 'Custom layer', visible: false }] })
  expect(result.rejected).toBe(4)
  expect(result.unchanged).toBe(true)
  expect(result.visibleAfterUndo).toBe(true)
})

test('rebind and disposal release independent controls', async ({ page }) => {
  await page.goto('/tests/index.html?parts')
  await page.evaluate(() => {
    ;(document.querySelector('overprint-toolbar') as any).controller = (window as any).controllers[1]
  })
  await page.locator('overprint-toolbar').getByRole('button', { name: 'Live paint (K)' }).click()
  expect(await page.evaluate(() => (window as any).controllers.map((c: any) => c.getState().tool))).toEqual(['select', 'paint'])
  await page.evaluate(() => (window as any).controllers[0].destroy())
  await expect(page.locator('overprint-canvas').getByRole('region')).toHaveCount(0)
  await expect(page.locator('overprint-layers').getByRole('button')).toHaveCount(0)
  await expect(page.locator('overprint-toolbar').getByRole('toolbar')).toBeVisible()
  await page.evaluate(() => (window as any).controllers[1].destroy())
  await expect(page.locator('overprint-toolbar').getByRole('toolbar')).toHaveCount(0)
})


test('canvas-only 3D uses its full width and board replacement resets an unmounted view', async ({ page }) => {
  await page.goto('/tests/index.html?parts')
  const fixture = componentBoard()
  await page.evaluate(async ({ data, name }) => {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    const editor = (window as any).controllers[0]
    await editor.loadBoard(new File([bytes], name))
    editor.setView('3d')
  }, { data: fixture.buffer.toString('base64'), name: fixture.name })
  const preview = page.locator('overprint-canvas').getByLabel('Assembled preview', { exact: true })
  await expect(preview).toBeVisible()
  await expect(preview).toHaveCSS('right', '0px')
  await page.locator('overprint-canvas').getByRole('img', { name: 'Demo board assembled 3D preview' }).waitFor()
  await page.evaluate(() => document.querySelector('overprint-canvas')!.remove())
  await page.evaluate(() => {
    const editor = (window as any).controllers[0]
    const board = editor.getDocument().board
    delete board.models
    editor.replaceBoard(board)
  })
  expect(await page.evaluate(() => (window as any).controllers[0].getState().view)).toBe('2d')
})

test('presentation props update parts without losing document edits', async ({ page }) => {
  await page.goto('/tests/index.html?parts')
  await page.locator('overprint-layers').getByRole('button', { name: 'Add layer', exact: true }).click()
  await page.evaluate(() => {
    Object.assign(document.querySelector('overprint-toolbar')!, { tools: ['paint', 'hand'], orientation: 'horizontal', showShortcuts: false })
    Object.assign(document.querySelector('overprint-palette')!, { presets: [{ name: 'Violet', color: '#7700ff' }], customColors: false, showPaintTarget: false })
    Object.assign(document.querySelector('overprint-layers')!, { showImport: false, showNativeLayers: false })
    Object.assign(document.querySelector('overprint-view-controls')!, { showViewMode: false })
    Object.assign(document.querySelector('overprint-canvas')!, { grid: false })
  })
  const toolbar = page.locator('overprint-toolbar')
  await expect(toolbar.getByRole('button', { name: 'Select (V / M)' })).toHaveCount(0)
  await expect(toolbar.locator('kbd')).toHaveCount(0)
  await expect(toolbar.getByRole('toolbar')).toHaveAttribute('aria-orientation', 'horizontal')
  await expect(page.locator('overprint-layers').getByRole('button', { name: 'Import graphic' })).toHaveCount(0)
  await expect(page.locator('overprint-layers').getByRole('checkbox', { name: 'Silkscreen' })).toHaveCount(0)
  await expect(page.locator('overprint-view-controls').getByRole('group', { name: 'Preview mode' })).toHaveCount(0)
  await expect(page.locator('overprint-canvas').locator('[part="surface"]')).not.toHaveClass(/canvas-grid/)
  await page.getByRole('button', { name: 'Paint Violet', exact: true }).click()
  expect(await page.evaluate(() => (window as any).controllers[0].getState().paintColor)).toBe('#7700ff')
  await expect(page.getByLabel('Paint target', { exact: true })).toHaveCount(0)
  await expect(page.locator('overprint-layers').getByRole('button', { name: 'Layer 1', exact: true })).toBeVisible()
  await page.evaluate(() => Object.assign(document.querySelector('overprint-toolbar')!, { tools: ['select', 'hand', 'paint'], showShortcuts: true }))
  await expect(toolbar.getByRole('button', { name: 'Select (V / M)' })).toBeVisible()
  await expect(toolbar.locator('kbd')).toHaveCount(3)
})
