import { expect, test } from 'bun:test'
import { solidPaintColor } from '../../../apps/web/app/utils/paintColor'
test('ink sampling accepts opaque colors and rejects transparency or paint servers', () => {
  expect(solidPaintColor('#abc')).toBe('#aabbcc')
  expect(solidPaintColor('rgb(18, 58, 188)')).toBe('#123abc')
  expect(solidPaintColor('rgba(18, 58, 188, 1)')).toBe('#123abc')
  for (const value of ['none', 'transparent', 'url(#gradient)', 'rgba(18,58,188,0.5)', 'rgb(300,0,0)', 'rgb(-1,0,0)']) expect(solidPaintColor(value)).toBeUndefined()
})
