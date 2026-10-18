import { test, expect, type Page } from '@playwright/test'
import { demoBoard } from '../fixtures/demoBoard'

const projects = (page: Page) => page.locator('section[aria-labelledby="all-projects-title"]')
const rows = (page: Page) => projects(page).getByRole('article')
const row = (page: Page, name: string) => rows(page).filter({ hasText: name })
const action = async (item: ReturnType<typeof row>, name: string) => {
  if ((await item.locator('details').getAttribute('open')) === null)
    await item.locator('summary').click()
  await item.getByRole('button', { name, exact: true }).click()
}
const openProjects = async (page: Page) => {
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
}
const backToEditor = async (page: Page) => {
  await page.getByRole('link', { name: 'Back to editor' }).click()
  await expect(page).toHaveURL(/\/$/)
}

const legacyProject = {
  version: 1,
  board: {
    name: 'Legacy board',
    bounds: { x: 0, y: 0, width: 50, height: 50 },
    outline: 'M0,0 L50,0 L50,50 L0,50 Z',
    holes: '',
    layers: {}
  },
  artwork: [],
  side: 'front',
  silk: true,
  mask: '#202723',
  fabrication: false
}

test('projects can be duplicated, renamed, reopened and deleted independently', async ({
  page
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await openProjects(page)
  await expect(rows(page)).toHaveCount(1)
  await action(row(page, 'Demo board'), 'Duplicate')
  await expect(rows(page)).toHaveCount(2)
  await action(row(page, 'Demo board copy'), 'Rename')
  await rows(page).first().getByLabel('Project name').fill('Second design')
  await rows(page).first().getByRole('button', { name: 'Save' }).click()
  await action(row(page, 'Second design'), 'Open')
  await expect(page).toHaveURL(/\/$/)
  await page.reload()
  await openProjects(page)
  await expect(row(page, 'Second design')).toContainText('Current')
  await action(row(page, 'Second design'), 'Delete')
  await row(page, 'Second design').getByRole('button', { name: 'Confirm deletion' }).click()
  await expect(rows(page)).toHaveCount(1)
})

test('search and sort use saved project names', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await openProjects(page)
  await action(row(page, 'Demo board'), 'Duplicate')
  await action(row(page, 'Demo board copy'), 'Rename')
  await rows(page).first().getByLabel('Project name').fill('Alpha')
  await rows(page).first().getByRole('button', { name: 'Save' }).click()
  await page.getByLabel('Search projects').fill('alpha')
  await expect(rows(page)).toHaveCount(1)
  await expect(row(page, 'Alpha')).toBeVisible()
  await page.getByLabel('Search projects').clear()
  await page.getByLabel('Sort projects').selectOption('name')
  await expect(rows(page).first()).toContainText('Alpha')
})

test('migrates a legacy localStorage project once and keeps the original', async ({ page }) => {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('overprint-project-v1', JSON.stringify(value))
      localStorage.setItem('seeded', 'true')
    }
  }, legacyProject)
  await page.goto('/')
  await openProjects(page)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('Legacy board')
  await page.reload()
  await expect(rows(page)).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('overprint-project-v1'))).toContain(
    'Legacy board'
  )
})

test('a direct Projects link migrates existing browser autosave', async ({ page }) => {
  await page.addInitScript(
    (value) => localStorage.setItem('overprint-project-v1', JSON.stringify(value)),
    legacyProject
  )
  await page.goto('/projects')
  await expect(row(page, 'Legacy board')).toBeVisible()
})

test('conflicting tabs preserve the newer saved project and allow a recovery copy', async ({
  page,
  context
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.getByRole('button', { name: 'Save project', exact: true })).toBeVisible()
  await page.getByRole('status').click()
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await other.keyboard.press('Control+s')
  await expect(other.getByRole('status')).toContainText('changed in another tab')
  await other.getByRole('button', { name: 'Save recovery copy', exact: true }).click()
  await expect(other.getByRole('status')).toContainText('Recovery copy saved')
  await openProjects(other)
  await expect(rows(other)).toHaveCount(2)
})

test('failed local writes stop navigation and leave download recovery available', async ({
  page
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await openProjects(page)
  await action(row(page, 'Demo board'), 'Duplicate')
  await expect(rows(page)).toHaveCount(2)
  await backToEditor(page)
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    }
  })
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Download recovery project' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download recovery project' }).click()
  expect((await download).suggestedFilename()).toBe('Demo board.overprint')
})

test('new PCB keeps the former project while PCB update keeps artwork and identity', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  for (const actionName of ['Update PCB, keep artwork', 'Open board']) {
    await page.getByLabel('More ways to open a board').click()
    await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
    await page
      .getByLabel('Choose board export')
      .setInputFiles('tests/fixtures/browser-import.kicad_pcb')
    await page.getByRole('button', { name: actionName, exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Open another board?' })).not.toBeVisible()
    await expect(page.locator('[data-artwork-layer] image')).toHaveCount(
      actionName.startsWith('Update') ? 1 : 0
    )
    await openProjects(page)
    await expect(rows(page)).toHaveCount(actionName.startsWith('Update') ? 1 : 2)
    await backToEditor(page)
  }
  await openProjects(page)
  await action(row(page, 'Demo board'), 'Open')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await openProjects(page)
  await page.screenshot({ path: 'test-results/projects-page-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/projects-page-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('corrupted legacy data is kept untouched and reports recovery guidance', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('overprint-project-v1', '{broken'))
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('kept untouched')
  expect(await page.evaluate(() => localStorage.getItem('overprint-project-v1'))).toBe('{broken')
  await openProjects(page)
  await page.getByRole('button', { name: 'Import project', exact: true }).click()
  await page
    .getByLabel('Choose project file')
    .setInputFiles({
      name: 'Recovered.overprint',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacyProject))
    })
  await expect(page).toHaveURL(/\/$/)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('overprint-project-v1'))).toBe('{broken')
})

test('restores the old IndexedDB autosave into the projects page', async ({ page }) => {
  await page.goto('/setup')
  await page.evaluate(async (value) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('overprint', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('projects')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite')
      tx.objectStore('projects').put(JSON.stringify(value), 'current')
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  }, legacyProject)
  await page.goto('/')
  await openProjects(page)
  await expect(rows(page)).toContainText('Legacy board')
})

test('importing the same project file creates distinct projects', async ({ page }) => {
  await page.goto('/')
  const file = {
    name: 'Design.overprint',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacyProject))
  }
  for (let i = 1; i <= 2; i++) {
    await openProjects(page)
    await page.getByRole('button', { name: 'Import project', exact: true }).click()
    await page.getByLabel('Choose project file').setInputFiles(file)
    await expect(page).toHaveURL(/\/$/)
    await openProjects(page)
    await expect(rows(page)).toHaveCount(i)
    await backToEditor(page)
  }
})

test('New from PCB opens the editor import flow', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('link', { name: 'New from PCB' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('dialog', { name: 'Import PCB' })).toBeVisible()
})

test('Library navigation opens the editor library for the current board', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await openProjects(page)
  await page.getByRole('link', { name: 'Library' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('dialog', { name: 'Library' })).toBeVisible()
})
