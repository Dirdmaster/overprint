import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { nodeRequestStream } from '../../server/utils/nodeRequestStream.ts'
import { MAX_ZIP_BYTES } from '../../server/utils/jlcUpload.ts'

test('incoming ZIP finishes even when upstream has stopped pulling', { timeout: 1000 }, async () => {
  const request = new PassThrough()
  const body = nodeRequestStream(request as IncomingMessage)
  const ended = once(request, 'end')
  request.write(Buffer.from('PK'))
  request.end(Buffer.from('zip'))
  await ended
  assert.equal(await new Response(body).text(), 'PKzip')
  assert.equal(request.listenerCount('data'), 0)
})

test('queued input is bounded to the ZIP limit', async () => {
  const request = new PassThrough()
  const body = nodeRequestStream(request as IncomingMessage)
  request.end(Buffer.alloc(MAX_ZIP_BYTES + 1))
  await assert.rejects(new Response(body).arrayBuffer(), { statusCode: 413 })
  assert.equal(request.listenerCount('data'), 0)
})

test('cancellation drains the request without destroying its socket', async () => {
  const request = new PassThrough({ autoDestroy: false })
  const body = nodeRequestStream(request as IncomingMessage)
  await body.cancel()
  const ended = once(request, 'end')
  request.end(Buffer.from('remaining bytes'))
  await ended
  assert.equal(request.destroyed, false)
})
