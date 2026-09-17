import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { readdirSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])

const workerOptions = () => ({
    modulesRoot: resolve('.output/cloudflare/_worker.js'),
    modules: ['index.js', ...readdirSync('.output/cloudflare/_worker.js/chunks', { recursive: true }).filter(name => /\.m?js$/.test(String(name))).map(name => `chunks/${name}`)].map(name => ({ type: 'ESModule' as const, path: resolve('.output/cloudflare/_worker.js', name) })),
    compatibilityDate: '2026-09-16', compatibilityFlags: ['nodejs_compat'],
})

test('built Pages worker streams to JLC before the browser finishes, preserving Content-Length', { timeout: 20_000 }, async () => {
  let release: () => void = () => {}
  const upstreamStarted = new Promise<void>(resolve => { release = resolve })
  let calls = 0
  const runtime = new Miniflare(convertV4MiniflareOptions({
    ...workerOptions(),
    outboundService: async request => {
      calls++
      assert.equal(request.url, 'https://cart.jlcpcb.com/api/overseas-core-platform/file/uploadGerber')
      const reader = request.body!.getReader()
      const first = await reader.read()
      assert.ok(first.value!.byteLength > 0)
      release()
      const chunks = [Buffer.from(first.value!)]
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        chunks.push(Buffer.from(chunk.value))
      }
      const bytes = Buffer.concat(chunks)
      assert.equal(Number(request.headers.get('content-length')), bytes.length)
      assert.ok(bytes.includes(Buffer.from(zip)))
      assert.ok(bytes.includes(Buffer.from('name="gerberFile"; filename="overprint.zip"')))
      return Response.json({ success: true, code: 200, data: { fileId: 'cloudflare-test', s3SignatureResponse: { local: true } } })
    },
  }))
  try {
    const url = new URL('/api/jlcpcb/upload', await runtime.ready)
    const headers = { origin: url.origin, 'content-type': 'application/zip', 'content-length': String(zip.length) }
    for (const [extra, status] of [[{ origin: 'https://wrong.example' }, 403], [{ 'content-type': 'text/plain' }, 415], [{ 'content-length': '20000001' }, 413]] as const) {
      const response = await runtime.dispatchFetch(url.href, { method: 'POST', headers: { ...headers, ...extra }, body: new Uint8Array(Number(({ ...headers, ...extra })['content-length'])) })
      assert.equal(response.status, status)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
    assert.equal(calls, 0)
    // Keep the body unfinished: even the trailing-slash route must reject the
    // declared size before trying to collect it through Nitro's adapter.
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(new URL('/api/jlcpcb/upload/', url), {
        method: 'POST', headers: { ...headers, 'content-length': '20000001' }, timeout: 1500,
      }, response => {
        try { assert.equal(response.statusCode, 413); resolve() } catch (error) { reject(error) }
        response.resume()
        req.destroy()
      })
      req.on('timeout', () => req.destroy(new Error('Upload rejection waited for the body')))
      req.on('error', reject)
      req.write(zip.subarray(0, 4))
    })
    const source = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(zip.subarray(0, 4))
        await upstreamStarted
        controller.enqueue(zip.subarray(4))
        controller.close()
      },
    })
    const response = await fetch(url, { method: 'POST', headers, body: source, duplex: 'half', signal: AbortSignal.timeout(10_000) } as RequestInit)
    assert.equal(response.status, 200, await response.clone().text())
    assert.deepEqual(await response.json(), { quoteUrl: 'https://cart.jlcpcb.com/quote/?homeUploadNum=cloudflare-test' })
    assert.equal(calls, 1)
  } finally { release(); await runtime.dispose() }
})


test('Pages returns an upstream refusal while browser input is unfinished', { timeout: 10_000 }, async () => {
  // Keep this mock inside workerd: the host HTTP mock's shutdown library cannot
  // cleanly terminate its own partially consumed upload connection.
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [
    { ...workerOptions(), name: 'app', outboundService: 'jlc' },
    { name: 'jlc', modules: true, compatibilityDate: '2026-09-16', script: `export default { async fetch(request) {
      const reader = request.body.getReader();
      await reader.read();
      await reader.cancel();
      return new Response(null, { status: 403 });
    } }` },
  ] }))
  try {
    const url = new URL('/api/jlcpcb/upload', await runtime.ready)
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(url, { method: 'POST', headers: {
        origin: url.origin, 'content-type': 'application/zip', 'content-length': String(zip.length),
      }, timeout: 1500 }, response => {
        try { assert.equal(response.statusCode, 502); resolve() } catch (error) { reject(error) }
        response.resume()
        req.destroy()
      })
      req.on('timeout', () => req.destroy(new Error('Upstream refusal waited for unfinished input')))
      req.on('error', reject)
      req.write(zip.subarray(0, 4))
    })
  } finally { await runtime.dispose() }
})
