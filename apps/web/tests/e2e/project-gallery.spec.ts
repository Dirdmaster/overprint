import { test, expect } from '@playwright/test'
import { demoBoard } from '../fixtures/demoBoard'

test('projects can be duplicated, renamed, reopened and deleted independently', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  const gallery = page.getByRole('dialog', { name: 'Projects', exact: true })
  await expect(gallery.getByRole('article')).toHaveCount(1)
  await gallery.getByRole('button', { name: 'Duplicate' }).click()
  await expect(gallery.getByRole('article')).toHaveCount(2)
  const copy = gallery.getByRole('article').filter({ hasText: 'copy' })
  await copy.getByLabel('Project name').fill('Second design')
  await copy.getByRole('button', { name: 'Rename' }).click()
  await gallery.getByRole('article').filter({ hasText: 'Second design' }).getByRole('button', { name: 'Open', exact: true }).click()
  await expect(gallery).not.toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(gallery.getByRole('article').filter({ hasText: 'Second design' })).toContainText('Current')
  await gallery.getByRole('article').filter({ hasText: 'Second design' }).getByRole('button', { name: 'Delete', exact: true }).click()
  await gallery.getByRole('button', { name: 'Confirm deletion' }).click()
  await expect(gallery.getByRole('article')).toHaveCount(1)
})
