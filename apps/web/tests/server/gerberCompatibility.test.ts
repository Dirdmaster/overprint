import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { withJlcColorHeader } from '../../app/utils/gerberCompatibility.ts'

test('adds recognition comments and an unused fingerprint aperture without rewriting native Gerber commands', () => {
  const original = 'G04 #@! TF.GenerationSoftware,KiCad,Pcbnew,10.0*\r\n%FSLAX46Y46*%\r\n%MOMM*%\r\n%ADD10C,0.5*%\r\nD10*\r\nX123450000Y-120000D03*\r\nM02*\r\n'
  const result = withJlcColorHeader(original, new Date('2026-09-15T12:00:00Z'))
  assert.ok(result.startsWith('G04 EasyEDA Pro v3.2.148, 2026-09-15 12:00:00*\nG04 Gerber Generator version 0.3*\n'))
  assert.ok(result.includes('G04 Overprint compatibility export from KiCad*\n'))
  const fingerprint = result.match(/^%ADD11C,0\.\d\d(\d\d)\*%\r\n/m)
  assert.ok(fingerprint)
  const unmarked = result.replace(fingerprint[0], '')
  assert.equal(unmarked.slice(unmarked.indexOf('G04 #@!')), original)
  assert.equal(Number(fingerprint[1]), createHash('md5').update(unmarked).digest()[15]! % 100)
})
