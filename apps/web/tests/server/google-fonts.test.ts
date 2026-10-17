import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { once } from 'node:events'
import { createGoogleFontsHandler } from '../../server/utils/googleFonts.ts'

const catalogue = { items: [{ family: 'Example Sans', category: 'sans-serif', version: 'v1', subsets: ['latin'], variants: ['regular', '700italic'], files: { regular: 'http://fonts.gstatic.com/s/example/v1/Regular.ttf', '700italic': 'https://fonts.gstatic.com/s/example/v1/BoldItalic.ttf' } }] }
const request = (path: string, options: RequestInit = {}) => new Request(`https://overprint.test/api/fonts/${path}`, options)

test('catalogue search returns pinned variants without exposing key or URLs and caches completed data', async () => {
  let calls = 0
  const handler = createGoogleFontsHandler({ fetcher: async (url, init) => {
    calls++
    const upstream = new URL(String(url))
    assert.equal(upstream.origin, 'https://www.googleapis.com')
    assert.equal(upstream.searchParams.get('key'), 'private-key')
    assert.equal(upstream.searchParams.get('subset'), 'latin')
    assert.equal(upstream.searchParams.get('sort'), 'popularity')
    assert.equal(upstream.searchParams.get('capability'), null)
    assert.equal(init?.redirect, 'manual')
    return Response.json(catalogue)
  } })
  const response = await handler(request('catalog?q=example&offset=0'), 'private-key')
  assert.equal(response.status, 200)
  const text = await response.text()
  assert.ok(!/private-key|gstatic|googleapis/.test(text))
  const body = JSON.parse(text)
  assert.equal(body.total, 1)
  assert.equal(body.families[0].family, 'Example Sans')
  assert.match(body.families[0].variants[0].id, /^[a-f0-9]{64}$/)
  const empty = await handler(request('catalog?q=missing'), 'private-key')
  assert.equal((await empty.json()).total, 0)
  assert.equal(calls, 1)
})

const ttf = () => { const bytes = new Uint8Array(32); bytes[1] = 1; bytes[5] = 1; bytes.set(new TextEncoder().encode('name'), 12); const view = new DataView(bytes.buffer); view.setUint32(20, 28); view.setUint32(24, 4); return bytes }
const selection = async (handler: ReturnType<typeof createGoogleFontsHandler>, key = 'secret') => {
  const body = await (await handler(request('catalog'), key)).json()
  return new URLSearchParams({ family: body.families[0].family, version: body.families[0].version, variant: body.families[0].variants[0].variant, id: body.families[0].variants[0].id }).toString()
}

test('font resolution is pinned, HTTPS-only and cached but rejects expired catalogue identities', async () => {
  let time = 0, fontCalls = 0
  const handler = createGoogleFontsHandler({ now: () => time, fetcher: async (url, init) => {
    if (String(url).startsWith('https://www.googleapis.com/')) return Response.json(time ? { items: [{ ...catalogue.items[0], version: 'v2' }] } : catalogue)
    fontCalls++
    assert.equal(String(url), 'https://fonts.gstatic.com/s/example/v1/Regular.ttf')
    assert.equal(init?.redirect, 'manual')
    return new Response(ttf(), { headers: { 'Content-Type': 'font/ttf' } })
  } })
  const query = await selection(handler)
  const stale = new URLSearchParams(query); stale.set('id', '0'.repeat(64))
  assert.equal((await handler(request(`file?${stale}`), 'secret')).status, 409)
  const first = await handler(request(`file?${query}`), 'secret')
  assert.equal(first.status, 200)
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), ttf())
  assert.equal((await handler(request(`file?${query}`), 'secret')).status, 200)
  assert.equal(fontCalls, 1)
  time = 3_600_001
  assert.equal((await handler(request(`file?${query}`), 'secret')).status, 409)
  assert.equal(fontCalls, 1)
})

test('rejects method, origin, body and proxy parameters before upstream access', async () => {
  let calls = 0
  const handler = createGoogleFontsHandler({ fetcher: async () => { calls++; return Response.json(catalogue) } })
  for (const [req, status] of [
    [request('catalog', { method: 'POST', body: 'x' }), 405],
    [request('catalog', { headers: { Origin: 'https://evil.test' } }), 403],
    [request('catalog', { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403],
    [request('catalog', { headers: { 'Content-Length': '10000000' } }), 400],
    [request('catalog?url=https://evil.test'), 400],
    [request('catalog?q=a&q=b'), 400],
    [request('catalog?offset=-1'), 400],
    [request('file?family=Example&variant=regular&version=v1&id=bad'), 400],
  ] as const) assert.equal((await handler(req, 'secret')).status, status)
  assert.equal(calls, 0)
  const missing = await handler(request('catalog'))
  assert.equal(missing.status, 503)
  assert.match(await missing.text(), /bundled font/)
})

test('upstream URLs and error bodies never leak credentials', async () => {
  for (const fetcher of [async () => { throw new Error('upstream secret-key https://www.googleapis.com/?key=secret-key') }, async () => new Response('secret-key', { status: 403 })]) {
    const handler = createGoogleFontsHandler({ fetcher })
    const response = await handler(request('catalog'), 'secret-key')
    assert.equal(response.status, 502)
    assert.doesNotMatch(await response.text(), /secret-key|googleapis/)
  }
})

test('discards non-allowlisted, variable and unsupported catalogue files', async () => {
  const handler = createGoogleFontsHandler({ fetcher: async () => Response.json({ items: [{ ...catalogue.items[0], variants: ['regular', 'italic', '700', 'variable', '700italic'], files: { regular: 'https://evil.test/font.ttf', italic: 'https://fonts.gstatic.com.evil.test/s/font.ttf', '700': 'https://fonts.gstatic.com/s/font.ttf?url=x', variable: 'https://fonts.gstatic.com/s/font.ttf', '700italic': 'https://fonts.gstatic.com/s/font.woff2' } }] }) })
  assert.deepEqual((await (await handler(request('catalog'), 'secret')).json()).families, [])
})

for (const [name, response] of [
  ['declared catalogue size', () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '10000001' } })],
  ['streamed catalogue size', () => new Response(new Uint8Array(10_000_001), { headers: { 'Content-Type': 'application/json' } })],
  ['catalogue content type', () => new Response('{}', { headers: { 'Content-Type': 'text/html' } })],
  ['catalogue redirect', () => new Response(null, { status: 302, headers: { Location: 'https://evil.test' } })],
  ['truncated catalogue', () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '99' } })],
] as const) test(`rejects ${name}`, async () => {
  const handler = createGoogleFontsHandler({ fetcher: async () => response() })
  assert.equal((await handler(request('catalog'), 'secret')).status, 502)
})

for (const [name, response] of [
  ['font size', () => new Response(new Uint8Array(4_000_001), { headers: { 'Content-Type': 'font/ttf' } })],
  ['font type', () => new Response(ttf(), { headers: { 'Content-Type': 'text/html' } })],
  ['font signature', () => new Response('not a font', { headers: { 'Content-Type': 'font/ttf' } })],
  ['variable font', () => { const bytes = ttf(); bytes.set(new TextEncoder().encode('fvar'), 12); return new Response(bytes, { headers: { 'Content-Type': 'font/ttf' } }) }],
] as const) test(`rejects ${name}`, async () => {
  const handler = createGoogleFontsHandler({ fetcher: async url => String(url).startsWith('https://www.googleapis.com/') ? Response.json(catalogue) : response() })
  assert.equal((await handler(request(`file?${await selection(handler)}`), 'secret')).status, 502)
})

test('bounds slow headers and slow streaming bodies with a deadline', async () => {
  for (const fetcher of [async () => new Promise<Response>(() => {}), async () => new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/json' } })]) {
    const handler = createGoogleFontsHandler({ fetcher, timeoutMs: 5 })
    assert.equal((await handler(request('catalog'), 'secret')).status, 504)
  }
})

test('does not share pending catalogue fetches between requests', async () => {
  let calls = 0
  const releases: (() => void)[] = []
  const handler = createGoogleFontsHandler({ fetcher: async () => { calls++; await new Promise<void>(resolve => releases.push(resolve)); return Response.json(catalogue) } })
  const first = handler(request('catalog'), 'secret'), second = handler(request('catalog'), 'secret')
  assert.equal(calls, 2)
  for (const release of releases) release()
  assert.equal((await first).status, 200); assert.equal((await second).status, 200)
})

test('font cache evicts completed entries at its bounded entry count', async () => {
  let fontCalls = 0
  const variants = ['regular', '100', '200', '300', '400', '500', '600', '700', '800']
  const handler = createGoogleFontsHandler({ fetcher: async url => {
    if (String(url).startsWith('https://www.googleapis.com/')) return Response.json({ items: [{ ...catalogue.items[0], variants, files: Object.fromEntries(variants.map(variant => [variant, `https://fonts.gstatic.com/s/example/v1/${variant}.ttf`])) }] })
    fontCalls++
    return new Response(ttf(), { headers: { 'Content-Type': 'font/ttf' } })
  } })
  const family = (await (await handler(request('catalog'), 'secret')).json()).families[0]
  const queries = family.variants.map((variant: { variant: string; id: string }) => new URLSearchParams({ family: family.family, version: family.version, ...variant }))
  for (const query of queries) assert.equal((await handler(request(`file?${query}`), 'secret')).status, 200)
  assert.equal(fontCalls, 9)
  assert.equal((await handler(request(`file?${queries[0]}`), 'secret')).status, 200)
  assert.equal(fontCalls, 10)
})


test('accepts an actually gzip-compressed upstream catalogue after fetch decodes its body', async () => {
  const compressed = gzipSync(JSON.stringify(catalogue))
  const oversized = gzipSync(new Uint8Array(10_000_001))
  const server = createServer((incoming, response) => {
    const body = incoming.url === '/oversized' ? oversized : compressed
    response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': body.length })
    response.end(body)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  try {
    const handler = createGoogleFontsHandler({ fetcher: (_, init) => fetch(`http://127.0.0.1:${address.port}`, init) })
    const response = await handler(request('catalog'), 'secret')
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal((await response.json()).families[0].family, 'Example Sans')
    const limited = createGoogleFontsHandler({ fetcher: (_, init) => fetch(`http://127.0.0.1:${address.port}/oversized`, init) })
    const rejected = await limited(request('catalog'), 'secret')
    assert.equal(rejected.status, 502)
    assert.match(await rejected.text(), /oversized/)
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})
