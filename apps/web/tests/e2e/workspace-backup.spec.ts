import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { demoBoard } from '../fixtures/demoBoard'

test('workspace backup restores project copies and rejects damaged input without replacing work', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export everything', exact: true }).click()
  const download = await downloadEvent
  const path = testInfo.outputPath('workspace.overprint-backup')
  await download.saveAs(path)
  const saved = JSON.parse(await readFile(path, 'utf8'))
  expect(saved.format).toBe('overprint-workspace')
  expect(saved.projects).toHaveLength(1)
  expect(saved.libraries).toHaveLength(0)
  await page.getByLabel('Choose workspace backup').setInputFiles(path)
  await expect(page.getByText('1 project and 0 library compositions', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Import backup copies', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await page.getByLabel('Choose workspace backup').setInputFiles({ name: 'broken.overprint-backup', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...saved, projects: [...saved.projects, saved.projects[0]] })) })
  await expect(page.getByRole('alert')).toContainText('Duplicate project')
  await expect(page.getByRole('article')).toHaveCount(2)
  await page.reload()
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
})

test('workspace copies remap linked sources and keep missing sources independent of existing libraries', async ({ page }, testInfo) => {
  const exportAll = async (name: string) => {
    const event = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export everything', exact: true }).click()
    const path = testInfo.outputPath(name)
    await (await event).saveAs(path)
    return { path, value: JSON.parse(await readFile(path, 'utf8')) }
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByLabel('Choose SVG graphic').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10Z" fill="#ff0000"/></svg>') })
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByLabel('Composition name', { exact: true }).fill('Backup logo')
  await page.getByRole('button', { name: 'Save selection', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Backup logo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Place linked Backup logo', exact: true }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(2)
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  const original = await exportAll('original.overprint-backup')
  await page.getByLabel('Choose workspace backup').setInputFiles(original.path)
  await expect(page.getByText('1 project and 1 library compositions', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Import backup copies', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  const combined = await exportAll('combined.overprint-backup')
  expect(combined.value.libraries).toHaveLength(2)
  const importedProject = combined.value.projects.find((p: any) => p.id !== original.value.projects[0].id)
  const importedAsset = combined.value.libraries.find((a: any) => a.id !== original.value.libraries[0].id)
  const oldLink = JSON.parse(original.value.projects[0].composition).artwork.find((a: any) => a.library).library
  const newLink = JSON.parse(importedProject.composition).artwork.find((a: any) => a.library).library
  expect(newLink.assetId).toBe(importedAsset.id)
  expect(newLink.revisionId).toBe(importedAsset.revisions[0].id)
  expect(newLink.instanceId).not.toBe(oldLink.instanceId)
  await page.getByLabel('Choose workspace backup').setInputFiles({ name: 'missing.overprint-backup', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...original.value, libraries: [] })) })
  await page.getByRole('button', { name: 'Import backup copies', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  const missing = await exportAll('missing-restored.overprint-backup')
  const missingProject = missing.value.projects.find((p: any) => !combined.value.projects.some((old: any) => old.id === p.id))
  const missingLink = JSON.parse(missingProject.composition).artwork.find((a: any) => a.library).library
  expect(missing.value.libraries.some((a: any) => a.id === missingLink.assetId)).toBe(false)
  expect(missingLink.snapshot.artwork[0].source).toContain('#ff0000')
  await page.getByLabel('Choose workspace backup').setInputFiles(original.path)
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'libraries') throw new DOMException('Storage full', 'QuotaExceededError')
      return add.apply(this, args)
    }
  })
  await page.getByRole('button', { name: 'Import backup copies', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('No copies were imported')
  const afterFailure = await exportAll('after-failure.overprint-backup')
  expect(afterFailure.value.projects).toHaveLength(3)
  expect(afterFailure.value.libraries).toHaveLength(2)
})
