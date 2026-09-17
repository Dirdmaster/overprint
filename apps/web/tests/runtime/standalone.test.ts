import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type AddressInfo } from 'node:net'

async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return String(port)
}

for (const runtime of ['bun', 'node']) {
  test(`standalone app serves assets and relays a ZIP under ${runtime}`, { timeout: 20_000 }, async () => {
    const child = spawn(runtime, [runtime === 'bun' ? '--preload' : '--import', './tests/runtime/mock-jlc.mjs', '.output/standalone/server/index.mjs'], {
      env: { ...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: await availablePort() }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const ready = new Promise<string>((resolve, reject) => {
      child.stdout.on('data', data => {
        output += data.toString()
        const match = output.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)
        if (match) resolve(match[1]!)
      })
      child.stderr.on('data', data => { output += data.toString() })
      child.once('error', reject)
      child.once('exit', () => reject(new Error(output)))
    })
    try {
      const origin = await ready
      const page = await fetch(origin)
      assert.equal(page.status, 200)
      assert.match(await page.text(), /Overprint/)
      const plugin = await fetch(`${origin}/downloads/overprint-kicad.zip`)
      assert.equal(plugin.status, 200)
      assert.equal(plugin.headers.get('content-type'), 'application/zip')
      const body = new Uint8Array(8_000_000)
      body.set([80, 75, 3, 4, 1, 2, 3, 4])
      const url = `${origin}/api/jlcpcb/upload`
      const wrongOrigin = await fetch(url, { method: 'POST', headers: { origin: 'https://other.example', 'content-type': 'application/zip' }, body })
      assert.equal(wrongOrigin.status, 403)
      const response = await fetch(url, { method: 'POST', headers: { origin, 'content-type': 'application/zip' }, body })
      assert.equal(response.status, 200, await response.clone().text())
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.deepEqual(await response.json(), { quoteUrl: 'https://cart.jlcpcb.com/quote/?homeUploadNum=standalone-test' })
    } finally {
      if (child.exitCode === null) {
        const exited = once(child, 'exit')
        child.kill('SIGTERM')
        await exited
      }
    }
  })
}
