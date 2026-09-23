import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { releaseChannel } from './editor-release.mjs'

test('stable editor releases use latest', () => {
  assert.equal(releaseChannel('editor-v1.2.3', '1.2.3'), 'latest')
})

test('prereleases never replace latest', () => {
  for (const version of ['0.1.0-alpha.0', '1.2.3-beta.1', '1.2.3-rc.2']) {
    assert.equal(releaseChannel(`editor-v${version}`, version), 'next')
  }
})

test('missing, unrelated and mismatched tags fail before publishing', () => {
  for (const tag of [undefined, 'v1.2.3', 'kicad-v1.2.3', 'editor-v1.2.4']) {
    assert.throws(() => releaseChannel(tag, '1.2.3'), /must match/)
  }
})
