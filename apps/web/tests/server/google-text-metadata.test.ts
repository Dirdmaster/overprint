import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultText, validateText } from '../../app/utils/textDrawing.ts'
const google = { family: 'Fixture Sans', variant: '700italic', version: 'v12', id: 'a'.repeat(64), sha256: 'b'.repeat(64), license: 'Fixture licence' }
test('Google font provenance survives validation while arbitrary sources and font bytes are discarded', () => {
  const input = { ...defaultText(), font: 'google-fonts-v1', weight: 700, google: { ...google, url: 'https://arbitrary.example/font', bytes: 'not allowed' } }
  assert.deepEqual(validateText(input).google, google)
  assert.equal(validateText({ ...defaultText(), google }).google, undefined)
  for (const patch of [{ version: '../v1' }, { variant: 'variable' }, { id: 'https://arbitrary.example/font' }, { sha256: 'wrong' }, { license: 'x'.repeat(4097) }]) {
    assert.throws(() => validateText({ ...input, google: { ...google, ...patch } }), /Invalid Google font/)
  }
  assert.throws(() => validateText({ ...input, weight: 400 }), /does not match/)
})
