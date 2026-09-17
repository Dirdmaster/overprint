// Preloaded only by the standalone runtime test. No test endpoint exists in
// production and no synthetic or private files leave this machine.
import assert from 'node:assert/strict'

globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://cart.jlcpcb.com/api/overseas-core-platform/file/uploadGerber')
  assert.equal(init.redirect, 'manual')
  const body = Buffer.from(await new Response(init.body).arrayBuffer())
  assert.equal(body.length, Number(new Headers(init.headers).get('content-length')))
  assert.ok(body.includes(Buffer.from([80, 75, 3, 4, 1, 2, 3, 4])))
  return Response.json({ success: true, code: 200, data: { fileId: 'standalone-test', s3SignatureResponse: { local: true } } })
}
