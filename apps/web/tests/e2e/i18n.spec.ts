import { expect, test } from '@playwright/test'

test('renders English setup on the server with unchanged routes', async ({ request }) => {
  const response = await request.get('/setup', { headers: { 'Accept-Language': 'fr-CH,fr;q=0.9' } })
  expect(response.status()).toBe(200)
  expect(new URL(response.url()).pathname).toBe('/setup')
  const html = await response.text()
  expect(html).toMatch(/<html[^>]*lang="en"/)
  expect(html).toContain('Add the Overprint repository')
  expect(html).toContain('https://overprint.ink/pcm/repository.json')
  expect(html).toContain('KiCad manual')
  expect(html).toContain('For the currently supported PCM procedure, see the ')
  expect(html).not.toContain('kicad.setup.manualNote')
})

test('shares translated instructions between the dialog and setup page', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => {
    if (/\[intlify\]|hydration.*mismatch/i.test(message.text())) failures.push(message.text())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'KiCad setup', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Import PCB' })
  const titles = await dialog.locator('li h3').allTextContents()
  expect(titles).toHaveLength(4)
  await dialog.getByRole('link', { name: 'Setup guide' }).click()
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.locator('li h2')).toHaveText(titles)
  await expect(page.getByRole('link', { name: 'KiCad manual' })).toHaveAttribute('href', /docs\.kicad\.org/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  expect(failures).toEqual([])
})
