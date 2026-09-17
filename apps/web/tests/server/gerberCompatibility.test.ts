import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withJlcColorHeader } from '../../app/utils/gerberCompatibility.ts'

test('adds recognition comments without changing native Gerber commands or line endings', () => {
  const original = 'G04 #@! TF.GenerationSoftware,KiCad,Pcbnew,10.0*\r\n%FSLAX46Y46*%\r\n%MOMM*%\r\nX123450000Y-120000D01*\r\nM02*\r\n'
  const result = withJlcColorHeader(original, new Date('2026-09-15T12:00:00Z'))
  assert.ok(result.startsWith('G04 EasyEDA Pro v2.2.42.2, 2026-09-15 12:00:00*\nG04 Gerber Generator version 0.3*\n'))
  assert.ok(result.includes('G04 Overprint compatibility export from KiCad*\n'))
  assert.equal(result.slice(result.indexOf('G04 #@!')), original)
})
