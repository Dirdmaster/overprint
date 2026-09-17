import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import { demoBoard } from '../fixtures/demoBoard'

let server: Server
let url: string
let mode = 'ok'
let boardIdentity = 'fixture-session'
let automatic = false
let pairRequests = 0
const token = 'a'.repeat(43)
test.beforeEach(async ({ page }) => {
  mode = 'ok'
  boardIdentity = 'fixture-session'
  automatic = false
  pairRequests = 0
  server = createServer((request, response) => {
    const origin = request.headers.origin ?? ''
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Headers', 'authorization, x-overprint-pairing')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST')
    response.setHeader('Access-Control-Expose-Headers', 'X-Overprint-Board-Id, X-Overprint-Sha256')
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
    if (request.url === '/v1/discover' || request.url === '/v1/pair') {
      if (!automatic) { response.writeHead(404); response.end(); return }
      if (request.url === '/v1/pair' && mode === 'denied') { pairRequests++; response.writeHead(403); response.end(); return }
      if (request.url === '/v1/pair' && mode === 'pending') { pairRequests++; return }
      const body = request.url === '/v1/discover' ? { service: 'overprint-sync', version: 2 } : { version: 1, url, token, origin }
      if (request.url === '/v1/pair') pairRequests++
      const text = JSON.stringify(body)
      response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) }); response.end(text); return
    }
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401); response.end(); return }
    if (request.url === '/v1/status') {
      const text = JSON.stringify({ version: 1, boardId: boardIdentity, boardName: 'Demo board', expiresAt: new Date(Date.now() + 60_000).toISOString() })
      response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) }); response.end(text); return
    }
    if (mode === 'expired') { response.writeHead(410); response.end(); return }
    response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': demoBoard.buffer.length, 'X-Overprint-Board-Id': mode === 'switched' ? 'other-board' : boardIdentity, 'X-Overprint-Sha256': mode === 'corrupt' ? '0'.repeat(64) : createHash('sha256').update(demoBoard.buffer).digest('hex') })
    if (mode === 'slow') setTimeout(() => response.end(demoBoard.buffer), 600)
    else response.end(demoBoard.buffer)
  })
  // Leave real KiCad instances alone and isolate discovery from their bridges.
  for (let port = 43190; port <= 43199; port++) {
    const listening = await new Promise<boolean>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => error.code === 'EADDRINUSE' ? resolve(false) : reject(error)
      server.once('error', onError)
      server.listen(port, '127.0.0.1', () => { server.off('error', onError); resolve(true) })
    })
    if (listening) break
  }
  if (!server.listening) throw new Error('No free KiCad test port in 43190–43199')
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  await page.route(/^http:\/\/127\.0\.0\.1:4319[0-9]\//, route =>
    new URL(route.request().url()).origin === url ? route.continue() : route.abort())
})
test.afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })

test('pairs locally, refreshes geometry and preserves artwork; credentials stay session-only', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByRole('button', { name: 'KiCad silkscreen', exact: true }).click()
  await page.getByRole('button', { name: 'KiCad ink color: White', exact: true }).click()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  const origin = new URL(page.url()).origin
  await dialog.getByText('Use a pairing code instead', { exact: true }).click()
  await dialog.getByLabel('KiCad pairing code').fill(JSON.stringify({ version: 1, url, token, origin }))
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog).toContainText('Connected to Demo board')
  await dialog.getByRole('button', { name: 'Sync board', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('[data-native-silkscreen] > path').first()).toHaveAttribute('fill', '#e63136')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await expect(page.locator('[data-native-silkscreen] > path').first()).toHaveAttribute('fill', '#e63136')
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await dialog.getByText('Use a pairing code instead', { exact: true }).click()
  await expect(dialog.getByLabel('KiCad pairing code')).toHaveValue('')
  await expect(dialog.getByRole('button', { name: 'Connect', exact: true })).toBeVisible()
})

test('rejects remote pairing and mismatched or corrupt snapshots without losing artwork', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  const origin = new URL(page.url()).origin
  await dialog.getByText('Use a pairing code instead', { exact: true }).click()
  await dialog.getByLabel('KiCad pairing code').fill(JSON.stringify({ version: 1, url: 'https://example.com', token, origin }))
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Paste the pairing code')
  await dialog.getByLabel('KiCad pairing code').fill(JSON.stringify({ version: 1, url, token, origin }))
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  for (const failure of ['switched', 'corrupt']) {
    mode = failure
    await dialog.getByRole('button', { name: 'Sync board', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText(failure === 'switched' ? 'different board' : 'integrity check')
    await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  }
  mode = 'expired'
  await dialog.getByRole('button', { name: 'Sync board', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('session ended')
  await expect(dialog.getByRole('button', { name: 'Scan again', exact: true })).toBeVisible()
})


test('Sync discovers KiCad, requests approval and refreshes without a pairing form', async ({ page }) => {
  automatic = true
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  await expect.poll(() => pairRequests).toBe(1)
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(pairRequests).toBe(1)
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect.poll(() => pairRequests).toBe(2)
  await expect(dialog).not.toBeVisible()
})


test('declined approval can retry and cancellation leaves artwork intact', async ({ page }) => {
  automatic = true
  mode = 'denied'
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  await expect(dialog.getByRole('alert')).toContainText('declined in KiCad')
  await expect(dialog.getByLabel('KiCad pairing code')).not.toBeVisible()
  mode = 'pending'
  await dialog.getByRole('button', { name: 'Scan again', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Approve the connection')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  mode = 'ok'
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect.poll(() => pairRequests).toBe(3)
  await expect(dialog).not.toBeVisible()
})

test('multiple editors require selection before requesting native approval', async ({ page }) => {
  automatic = true
  // A second discovery response contains no board name or credentials.
  await page.route(`${url.endsWith(':43199') ? 'http://127.0.0.1:43198' : 'http://127.0.0.1:43199'}/v1/discover`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ service: 'overprint-sync', version: 2 }),
  }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Import PCB', exact: true }).click()
  await page.getByLabel('Choose board export').setInputFiles(demoBoard)
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  await expect(dialog).toContainText('Choose the board')
  expect(pairRequests).toBe(0)
  await dialog.getByRole('button', { name: new RegExp(`^KiCad editor ${url.endsWith(':43199') ? 2 : 1}`) }).click()
  await expect.poll(() => pairRequests).toBe(1)
  await expect(dialog).not.toBeVisible()
})


test('empty state scans named boards and imports only the chosen board', async ({ page }) => {
  automatic = true
  await page.route(`${url}/v1/discover`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ service: 'overprint-sync', version: 3, boardName: 'Demo board', boardId: 'fixture-session', requiresApproval: false }),
  }))
  const secondUrl = url.endsWith(':43199') ? 'http://127.0.0.1:43198' : 'http://127.0.0.1:43199'
  await page.route(`${secondUrl}/v1/discover`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ service: 'overprint-sync', version: 3, boardName: 'Another board', boardId: 'another-session', requiresApproval: false }),
  }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scan for boards', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  await expect(dialog.getByRole('button', { name: /Demo board/ })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Another board/ })).toBeVisible()
  expect(pairRequests).toBe(0)
  await dialog.getByRole('button', { name: /Demo board/ }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeVisible()
  expect(pairRequests).toBe(1)
})


test('does not import a different board when a discovery port is reused', async ({ page }) => {
  automatic = true
  await page.route(`${url}/v1/discover`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ service: 'overprint-sync', version: 3, boardName: 'Previous board', boardId: 'previous-session', requiresApproval: false }),
  }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scan for boards', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  await dialog.getByRole('button', { name: /Previous board/ }).click()
  await expect(dialog.getByRole('alert')).toContainText('selected board changed')
  await dialog.getByRole('button', { name: 'Close sync', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Scan for boards', exact: true })).toBeVisible()
})


test('opening from KiCad always shows the picker even with a connected board', async ({ page }) => {
  automatic = true
  await page.goto('/')
  await page.getByRole('button', { name: 'Scan for boards', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  await dialog.getByRole('button', { name: /^KiCad editor 1/ }).click()
  await expect(dialog).not.toBeVisible()
  expect(pairRequests).toBe(1)
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  boardIdentity = 'another-session'
  await page.getByRole('button', { name: 'Open from KiCad', exact: true }).click()
  await expect(dialog.getByRole('button', { name: /^KiCad editor 1/ })).toBeVisible()
  expect(pairRequests).toBe(1)
  await dialog.getByRole('button', { name: /^KiCad editor 1/ }).click()
  const warning = page.getByRole('dialog', { name: 'Open another board?' })
  await expect(warning).toBeVisible()
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close sync', exact: true }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  boardIdentity = 'fixture-session'
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  boardIdentity = 'another-session'
  await page.getByRole('button', { name: 'Open from KiCad', exact: true }).click()
  await dialog.getByRole('button', { name: /^KiCad editor 1/ }).click()
  await warning.getByRole('button', { name: 'Open board', exact: true }).click()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(0)
  await expect(dialog).not.toBeVisible()
  expect(pairRequests).toBe(3)
})


test('disables the current board after reload while header Sync still preserves artwork', async ({ page }) => {
  automatic = true
  await page.route(`${url}/v1/discover`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ service: 'overprint-sync', version: 3, boardName: 'Demo board', boardId: boardIdentity, requiresApproval: false }),
  }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scan for boards', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  await dialog.getByRole('button', { name: 'Demo board', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  await page.getByRole('button', { name: 'Open from KiCad', exact: true }).click()
  await expect(dialog.getByText('Current board', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Demo board Current board', exact: true })).toBeDisabled()
  expect(pairRequests).toBe(1)
  await dialog.getByRole('button', { name: 'Close sync', exact: true }).click()
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect.poll(() => pairRequests).toBe(2)
  await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeEnabled()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Open another board?' })).not.toBeVisible()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
})


test('connected sync animates only the header icon and shows inline errors', async ({ page }) => {
  automatic = true
  await page.route(`${url}/v1/discover`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ service: 'overprint-sync', version: 3, boardName: 'Demo board', boardId: boardIdentity, requiresApproval: false }),
  }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scan for boards', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sync with KiCad' })
  await dialog.getByRole('button', { name: 'Demo board', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByLabel('Choose SVG graphic').setInputFiles('tests/fixtures/class-paints.svg')
  mode = 'slow'
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  const syncing = page.getByRole('button', { name: 'Sync', exact: true })
  await expect(syncing).toBeDisabled()
  await expect(syncing).toHaveAttribute('aria-busy', 'true')
  await expect(syncing).not.toHaveClass(/header-action-success/)
  await expect(dialog).not.toBeVisible()
  await expect(syncing.locator('svg')).toHaveClass(/animate-spin/)
  await expect(page.getByRole('button', { name: 'Cancel sync', exact: true })).toHaveCount(0)
  await expect(syncing).toBeEnabled()
  await expect(syncing.locator('svg')).not.toHaveClass(/animate-spin/)
  await expect(syncing).toHaveClass(/header-action-success/)
  await expect(syncing).toHaveAttribute('title', 'Last sync successful')
  // Success is a brief highlight, not a permanent green status.
  await expect(syncing).toHaveCSS('background-color', 'rgb(237, 239, 231)', { timeout: 4000 })
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  mode = 'corrupt'
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('integrity check')
  await expect(syncing).not.toHaveClass(/header-action-success/)
  await page.screenshot({ path: 'test-results/header-sync-desktop.png', animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/header-sync-mobile.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(dialog).not.toBeVisible()
  mode = 'ok'
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).not.toBeVisible()
  await expect(page.locator('[data-artwork-layer] image')).toHaveCount(1)
  // Reconnecting to a trusted listener after reload also stays in the header.
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('status')).toContainText('All changes saved')
  await page.reload()
  mode = 'slow'
  await page.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect(syncing).toBeVisible()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeEnabled()
  await expect(dialog).not.toBeVisible()
})
