// Preloaded only by the standalone runtime test. No test endpoint exists in
// production and no synthetic or private files leave this machine.
import assert from 'node:assert/strict'

globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://www.googleapis.com/webfonts/v1/webfonts?')) {
    assert.equal(new URL(String(url)).searchParams.get('key'), 'runtime-font-key')
    return Response.json({ items: [{ family: 'Runtime Sans', category: 'sans-serif', version: 'v1', subsets: ['latin'], variants: ['regular'], files: { regular: 'https://fonts.gstatic.com/s/runtime/v1/Regular.ttf' } }] })
  }
  if (String(url) === 'https://fonts.gstatic.com/s/runtime/v1/Regular.ttf') {
    assert.equal(init.redirect, 'manual')
    const bytes = new Uint8Array(32); bytes[1] = 1; bytes[5] = 1
    bytes.set(new TextEncoder().encode('name'), 12)
    const view = new DataView(bytes.buffer); view.setUint32(20, 28); view.setUint32(24, 4)
    return new Response(bytes, { headers: { 'Content-Type': 'font/ttf' } })
  }
  assert.equal(String(url), 'https://cart.jlcpcb.com/api/overseas-core-platform/file/uploadGerber')
  assert.equal(init.redirect, 'manual')
  const body = Buffer.from(await new Response(init.body).arrayBuffer())
  assert.equal(body.length, Number(new Headers(init.headers).get('content-length')))
  assert.ok(body.includes(Buffer.from([80, 75, 3, 4, 1, 2, 3, 4])))
  return Response.json({ success: true, code: 200, data: { fileId: 'standalone-test', s3SignatureResponse: { local: true } } })
}
