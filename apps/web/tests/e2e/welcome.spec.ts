import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

test('downloads an installable plugin package from setup', async ({ page }) => {
  await page.goto('/setup')
  const downloading = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download plugin', exact: true }).click()
  const download = await downloading
  const files = unzipSync(readFileSync((await download.path())!))
  const metadata = JSON.parse(strFromU8(files['metadata.json']!))
  expect(metadata.identifier).toBe('casa.vallee.overprint')
  expect(metadata.license).toBe('MIT')
  expect(strFromU8(files['plugins/LICENSE']!)).toContain('MIT License')
  expect(strFromU8(files['plugins/LICENSE']!)).toContain('Permission is hereby granted, free of charge')
  expect(metadata.versions[0].kicad_version).toBe('10.0')
  for (const name of ['plugins/__init__.py', 'plugins/action.py', 'plugins/exporter.py', 'plugins/LICENSE', 'resources/icon.png']) expect(files[name]?.length).toBeGreaterThan(0)
})

test('opens setup, traps focus, and restores focus on Escape', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'KiCad setup', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Import PCB' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Add the Overprint repository', exact: true })).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Download plugin', exact: true })).toHaveAttribute('href', '/downloads/overprint-kicad.zip')
  await dialog.getByRole('button', { name: 'Close import' }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('link', { name: 'Setup guide' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close import' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('remembers a chosen theme after reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
})

test('keeps one canvas tool selected and restores it after held Space', async ({ page }) => {
  await page.goto('/')
  const select = page.getByRole('button', { name: 'Select (V / M)', exact: true })
  const hand = page.getByRole('button', { name: 'Hand (hold Space)', exact: true })
  await hand.click()
  await expect(hand).toHaveAttribute('aria-pressed', 'true')
  await expect(select).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('v')
  await expect(select).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.down('Space')
  await expect(hand).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.up('Space')
  await expect(select).toHaveAttribute('aria-pressed', 'true')
})

test('menu setup returns focus and chosen files give honest feedback', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Project menu', { exact: true }).click()
  await page.getByRole('navigation', { name: 'Project actions' }).getByRole('button', { name: 'Import PCB', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Import PCB' })
  await expect(dialog.getByRole('button', { name: 'Exporting from KiCad?' })).toHaveAttribute('aria-expanded', 'false')
  await dialog.getByLabel('Choose board export').setInputFiles({ name: 'board.zip', mimeType: 'application/zip', buffer: Buffer.from('fixture') })
  await expect(dialog.getByRole('status')).toContainText('Invalid board export')
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Project menu', { exact: true })).toBeFocused()
})

test('setup remains usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'KiCad setup', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Import PCB' })
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await dialog.getByRole('link', { name: 'Setup guide' }).click()
  await expect(page.getByRole('heading', { name: 'KiCad setup', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to editor', exact: false }).click()
  await expect(page.getByRole('button', { name: 'Import PCB', exact: true })).toBeVisible()
})

test('Escape returns keyboard focus from a menu action to its trigger', async ({ page }) => {
  await page.goto('/')
  const menu = page.getByLabel('Project menu', { exact: true })
  await menu.click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('navigation', { name: 'Project actions' }).getByRole('button', { name: 'Open from KiCad', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await expect(page.getByRole('navigation', { name: 'Project actions' })).not.toBeVisible()
})

test('switches layouts without duplicating shared controls or theme listeners', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  for (let visit = 0; visit < 2; visit++) {
    await page.getByRole('button', { name: 'KiCad setup', exact: true }).click()
    await page.getByRole('link', { name: 'Setup guide' }).click()
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('contentinfo')).toHaveCount(1)
    await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await page.getByRole('link', { name: 'Back to editor', exact: false }).click()
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('contentinfo')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toHaveCount(1)
    await page.keyboard.press('Control+d')
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toHaveCount(1)
  }
})

test('project picker can select the same file again after feedback is dismissed', async ({ page }) => {
  await page.goto('/')
  const invalidProject = { name: 'invalid.overprint', mimeType: 'application/json', buffer: Buffer.from('{}') }
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Open project', exact: true }).click({ noWaitAfter: true })
    await page.getByLabel('Choose project file').setInputFiles(invalidProject)
    const status = page.getByRole('status')
    await expect(status).toContainText('Could not open project')
    await status.click()
    await expect(status).toHaveCount(0)
  }
})
