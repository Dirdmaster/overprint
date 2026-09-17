import { test } from 'node:test'
import assert from 'node:assert/strict'
import { uploadJlcZip } from '../../app/utils/jlcUpload.ts'
const zip = new Blob(['fixture'])

test('retries transient failure once with the same ZIP and a fresh signal', async () => {
  const signals: unknown[] = []
  let retries = 0
  const response = await uploadJlcZip(zip, new AbortController().signal, () => retries++, async (_, init) => {
    assert.equal(init!.body, zip)
    signals.push(init!.signal)
    return new Response(null, { status: signals.length === 1 ? 502 : 200 })
  })
  assert.equal(response.status, 200)
  assert.equal(retries, 1)
  assert.notEqual(signals[0], signals[1])
})
test('does not retry invalid ZIP responses', async () => {
  const response = await uploadJlcZip(zip, new AbortController().signal, () => assert.fail(), async () => new Response(null, { status: 400 }))
  assert.equal(response.status, 400)
})
test('network failures stop after two attempts', async () => {
  let attempts = 0
  await assert.rejects(uploadJlcZip(zip, new AbortController().signal, () => {}, async () => {
    attempts++; throw new TypeError('Network error')
  }), /Network error/)
  assert.equal(attempts, 2)
})
test('cancelling during backoff prevents another request', async () => {
  const abort = new AbortController()
  let attempts = 0
  await assert.rejects(uploadJlcZip(zip, abort.signal, () => abort.abort(), async () => {
    attempts++; return new Response(null, { status: 502 })
  }), { name: 'AbortError' })
  assert.equal(attempts, 1)
})
