import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateFabrication } from '../../app/utils/fabrication.ts'
const fixture = () => ({ version: 1, copperLayers: 2, originMm: [0, 0], files: Object.fromEntries([
  ...['F_Cu', 'B_Cu', 'F_Mask', 'B_Mask', 'F_Silkscreen', 'B_Silkscreen', 'Edge_Cuts'].map(name => [`fabrication/${name}.gbr`, '%MOMM*%\r\nM02*\r\n']),
  ['fabrication/drill-0.drl', 'M48\nM30\n'],
]) })
test('preserves native fabrication text exactly across JSON persistence', () => {
  const f = fixture()
  assert.deepEqual(validateFabrication(JSON.parse(JSON.stringify(f))), f)
})
test('rejects missing layers, invalid paths, truncated drills and unexpected origins', () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { delete f.files['fabrication/F_Cu.gbr'] },
    (f: ReturnType<typeof fixture>) => { f.files['fabrication/../secret.gbr'] = '%MOMM*%M02*' },
    (f: ReturnType<typeof fixture>) => { f.files['fabrication/drill-0.drl'] = 'M48' },
    (f: ReturnType<typeof fixture>) => { f.originMm = [1, 0] },
    (f: ReturnType<typeof fixture>) => { f.copperLayers = 4 },
  ]) { const f = fixture(); change(f); assert.throws(() => validateFabrication(f)) }
})
