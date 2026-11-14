import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { loadPyodide } from 'pyodide'
import { assertPanelSize } from '../../app/utils/panel/panelLayout.ts'

test('browser CAM preserves fabrication geometry and rejects unsafe inputs', { timeout: 30_000 }, async () => {
  const vendor = new URL('../../vendor/panel-cam/', import.meta.url)
  const fixtures = new URL('../fixtures/panels/', import.meta.url)
  const [wheels, program, checks, board] = await Promise.all([
    readdir(vendor),
    readFile(new URL('../../app/utils/panel/panel_cam.py', import.meta.url), 'utf8'),
    readFile(new URL('cam_checks.py', fixtures), 'utf8'),
    readFile(new URL('coupon-a.overprint', fixtures), 'utf8'),
  ])
  const python = await loadPyodide({ packageBaseURL: vendor.href })
  await python.loadPackage(wheels.filter(name => name.endsWith('.whl')).map(name => new URL(name, vendor).href))
  python.runPython(program)
  python.globals.set('fixture_data', board)
  assert.equal(python.runPython(checks), true)
})

test('panel color size is checked before starting the fabrication worker', () => {
  assert.doesNotThrow(() => assertPanelSize({ x: 0, y: 0, width: 100, height: 100 }))
  assert.throws(() => assertPanelSize({ x: 0, y: 0, width: 600, height: 300 }), /exceeds 256 megapixels/)
})
