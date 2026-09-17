import { test } from 'node:test'
import assert from 'node:assert/strict'
import { uploadToJlc, MAX_ZIP_BYTES } from '../../server/utils/jlcUpload.ts'

const stream = (chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close() } })

const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])
const success = () => Response.json({ success: true, code: 200, data: { fileId: 'demo-123', s3SignatureResponse: { local: true } } })
test('streams multipart to the fixed upstream and returns the verified quote route', async () => {
  let consumed = false
  let index = 0
  const input = new ReadableStream<Uint8Array>({ pull(controller) {
    if (index++ === 0) controller.enqueue(zip.subarray(0, 2))
    else { consumed = true; controller.enqueue(zip.subarray(2)); controller.close() }
  } }, { highWaterMark: 0 })
  const result = await uploadToJlc(input, zip.length, undefined, async (url, init) => {
    assert.ok(init!.body instanceof ReadableStream, 'multipart must be a portable Web Stream')
    assert.equal(init!.redirect, 'manual')
    assert.equal(consumed, false)
    assert.equal(url, 'https://cart.jlcpcb.com/api/overseas-core-platform/file/uploadGerber')
    const parts = []
    for await (const part of init!.body as ReadableStream<Uint8Array>) parts.push(Buffer.from(part))
    const bytes = Buffer.concat(parts)
    assert.ok(bytes.includes(zip))
    assert.ok(bytes.includes(Buffer.from('name="gerberFile"; filename="overprint.zip"')))
    assert.equal(bytes.length, Number(new Headers(init!.headers).get('Content-Length')))
    return success()
  })
  assert.equal(result.quoteUrl, 'https://cart.jlcpcb.com/quote/?homeUploadNum=demo-123')
})
test('rejects excessive sizes before contacting upstream', async () => {
  await assert.rejects(uploadToJlc(stream([zip]), MAX_ZIP_BYTES + 1, undefined, async () => { assert.fail('must not upload') }), /under 20 MB/)
})
for (const [name, bytes, size] of [['not ZIP', Buffer.from('nope'), 4], ['truncated', zip, 12], ['oversized', zip, 4]] as const) {
  test(`rejects ${name} streams`, async () => {
    await assert.rejects(uploadToJlc(stream([bytes]), size, undefined, async (_, init) => {
      for await (const _ of init!.body as ReadableStream<Uint8Array>) { /* Consume incrementally as fetch does. */ }
      return success()
    }))
  })
}
test('upstream errors, malformed responses, and additional upload steps never produce quote links', async () => {
  for (const response of [new Response(null, { status: 307, headers: { location: 'https://other.example' } }), new Response('error', { status: 500 }), new Response('not json'), new Response('x'.repeat(70000)), Response.json({ success: true, code: 200, data: { fileId: 'abc', s3SignatureResponse: { local: false } } })]) {
    await assert.rejects(uploadToJlc(stream([zip]), zip.length, undefined, async () => response))
  }
})
test('propagates cancellation to the upstream request', async () => {
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(uploadToJlc(stream([zip]), zip.length, abort.signal, async (_, init) => {
    assert.equal(init!.signal!.aborted, true)
    throw new DOMException('Cancelled', 'AbortError')
  }), /cancelled/)
})
test('does not accept success before the input has been validated and sent', async () => {
  await assert.rejects(uploadToJlc(stream([Buffer.from('nope')]), 4, undefined, async () => success()), /before the ZIP upload completed/)
})
test('requires strictly typed upstream success and file IDs', async () => {
  for (const data of [{ success: 'false', fileId: 'abc' }, { success: true, fileId: 123 }, { success: true, fileId: ['abc'] }]) {
    await assert.rejects(uploadToJlc(stream([zip]), zip.length, undefined, async (_, init) => {
      for await (const _ of init!.body as ReadableStream<Uint8Array>) { /* Complete the input. */ }
      return Response.json({ success: data.success, code: 200, data: { fileId: data.fileId, s3SignatureResponse: { local: true } } })
    }), /rejected the ZIP/)
  }
})
test('cancels an in-flight request and closes the outgoing stream', async () => {
  const abort = new AbortController()
  let outgoing: ReadableStream<Uint8Array> | undefined
  const pending = uploadToJlc(stream([zip]), zip.length, abort.signal, async (_, init) => {
    outgoing = init!.body as ReadableStream<Uint8Array>
    for await (const _ of outgoing) { /* Complete request before stalled upstream response. */ }
    return await new Promise<Response>((_, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
      abort.abort()
    })
  })
  await assert.rejects(pending, /cancelled/)
  assert.equal((await outgoing!.getReader().read()).done, true)
})

test('early upstream rejection cancels a stalled browser input without waiting for more bytes', { timeout: 1000 }, async () => {
  let cancelled = false
  const input = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(zip.subarray(0, 4)) },
    cancel() { cancelled = true },
  })
  await assert.rejects(uploadToJlc(input, zip.length, undefined, async (_, init) => {
    const reader = (init!.body as ReadableStream<Uint8Array>).getReader()
    await reader.read() // multipart prefix
    await reader.read() // ZIP signature
    // Fetch is still pulling the unfinished request when the server refuses it.
    const pending = reader.read()
    void pending.finally(() => reader.releaseLock()).catch(() => {})
    return new Response(null, { status: 403 })
  }), /could not accept/)
  assert.equal(cancelled, true)
})

test('cancellation while reading the ZIP is not reported as an incomplete upload', async () => {
  const abort = new AbortController()
  const input = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(zip.subarray(0, 4)) },
  })
  await assert.rejects(uploadToJlc(input, zip.length, abort.signal, async (_, init) => {
    const reader = (init!.body as ReadableStream<Uint8Array>).getReader()
    try {
      await reader.read()
      await reader.read()
      const pending = reader.read()
      abort.abort()
      await pending
      return success()
    } finally { reader.releaseLock() }
  }), /timed out or was cancelled/)
})


test('a genuinely truncated ZIP reports the received and expected byte counts', async () => {
  await assert.rejects(uploadToJlc(stream([zip]), 12, undefined, async (_, init) => {
    for await (const _ of init!.body as ReadableStream<Uint8Array>) { /* Drain input. */ }
    return success()
  }), { statusCode: 400, message: 'ZIP upload was incomplete (received 8 of 12 bytes).' })
})
