import { test, expect } from '@playwright/test'

test('relay rejects foreign origins and unsupported bodies before upload', async ({ request, baseURL }) => {
  const foreign = await request.post('/api/jlcpcb/upload', { headers: { Origin: 'https://example.com', 'Content-Type': 'application/zip' }, data: 'PKxx' })
  expect(foreign.status()).toBe(403)
  const wrongType = await request.post('/api/jlcpcb/upload', { headers: { Origin: baseURL! }, data: 'not a ZIP' })
  expect(wrongType.status()).toBe(415)
  const empty = await request.post('/api/jlcpcb/upload', { headers: { Origin: baseURL!, 'Content-Type': 'application/zip' }, data: '' })
  expect(empty.status()).toBe(413)
  expect(empty.headers()['cache-control']).toBe('no-store')
})
