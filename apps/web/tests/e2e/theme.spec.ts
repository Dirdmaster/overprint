import { expect, test } from '@playwright/test'

test('follows system changes until overridden and can return to system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  await page.getByLabel('Project menu', { exact: true }).click()
  await page.getByRole('button', { name: 'Use system theme' }).click()
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
})

for (const modifier of ['Meta', 'Control']) {
  test(`${modifier}+D toggles theme once and persists it`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Select (V / M)', exact: true }).click()
    await page.keyboard.press(`${modifier}+d`)
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  })
}
