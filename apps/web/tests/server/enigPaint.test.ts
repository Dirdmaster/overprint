import { test } from 'node:test'
import assert from 'node:assert/strict'
import ClipperLib from 'clipper-lib'
import { addGerberRegions, goldItemRings, polygonRings, validateGoldRegions } from '../../app/utils/enigPaint.ts'
import type { Artwork } from '../../app/utils/artwork.ts'
import type { BoardPackage } from '../../app/utils/boardPackage.ts'
import { createPaintRegions } from '../../app/utils/paintRegions.ts'

const square = (x: number, y: number, size: number) => `M${x},${y} L${x + size},${y} L${x + size},${y + size} L${x},${y + size} Z`
const board: BoardPackage = {
  name: 'Gold test', bounds: { x: 0, y: 0, width: 20, height: 20 }, outline: square(0, 0, 20),
  holes: square(15, 15, 1), layers: { 'front-copper': [square(2, 2, 2)], 'front-mask': [square(2, 2, 2)] }
}
const gold = (path = square(8, 8, 2), x = 8, y = 8): Artwork => ({
  id: 'gold', name: 'Gold', side: 'front', source: '<svg data-overprint-fill="true"/>',
  x, y, width: 2, height: 2, rotation: 0, visible: true,
  gold: { path, bounds: { x: 8, y: 8, width: 2, height: 2 } }
})

test('gold follows layer transforms and rejects copper, holes and edges', () => {
  assert.equal(polygonRings('M0 0 L2 0 L2 2 L0 2 Z')[0]!.length, 4)
  assert.equal(goldItemRings(gold())[0]![0]!.X, 800000)
  assert.equal(goldItemRings(gold(square(8, 8, 2), 10, 10))[0]![0]!.X, 1000000)
  assert.equal(validateGoldRegions(board, [gold()], 'front').length, 1)
  assert.throws(() => validateGoldRegions(board, [gold(square(8, 8, 2), 3, 3)], 'front'), /within 0.25 mm/)
  assert.throws(() => validateGoldRegions(board, [gold(square(8, 8, 2), 15, 15)], 'front'), /within 0.25 mm/)
  assert.throws(() => validateGoldRegions(board, [gold(square(8, 8, 2), 19, 8)], 'front'), /within 0.25 mm/)
  assert.throws(() => validateGoldRegions({ ...board, layers: {} }, [gold()], 'front'), /copper and solder-mask geometry/)
  assert.doesNotThrow(() => validateGoldRegions(board, [gold(`${square(8, 8, 2)} ${square(8.5, 8.5, 0.5)}`)], 'front'))
})

test('native Gerber commands survive copper and mask region addition', () => {
  const original = 'G04 KiCad board*\n%FSLAX46Y46*%\n%MOMM*%\n%ADD10C,0.500*%\nD10*\nX0001000000Y-0001000000D03*\nM02*\n'
  const changed = addGerberRegions(original, goldItemRings(gold()))
  assert.ok(changed.includes('X0001000000Y-0001000000D03*'))
  assert.ok(changed.includes('%ADD11C,0.001*%'))
  assert.ok(changed.includes('G36*\nX0008000000Y-0008000000D02*'))
  assert.ok(changed.endsWith('G37*\nM02*\n'))
  assert.equal((changed.match(/M02\*/g) ?? []).length, 1)
  assert.throws(() => addGerberRegions('%MOMM*%\nM02*', goldItemRings(gold())), /supported coordinate format/)
})

test('ENIG accepts a native silkscreen region with an enclosed cutout', () => {
  const outer = square(8, 8, 4)
  const inner = square(9, 9, 2)
  const region = createPaintRegions([`${outer} ${inner}`])({ x: 8.5, y: 8.5 })!
  assert.equal(polygonRings(region.path).length, 2)
  const item = {
    ...gold(region.path), ...region.bounds,
    gold: { path: region.path, bounds: region.bounds }
  }
  const centerPad = square(9.8, 9.8, 0.2)
  const cleanBoard = { ...board, layers: { 'front-copper': [centerPad], 'front-mask': [centerPad] } }
  const solid = validateGoldRegions(cleanBoard, [item], 'front')
  const at = (x: number, y: number) => solid.some(ring => ClipperLib.Clipper.PointInPolygon({ X: x * 100000, Y: y * 100000 }, ring) !== 0)
  assert.equal(at(8.5, 8.5), true)
  assert.equal(at(10, 10), false)
  const edgePad = square(9.1, 9.8, 0.1)
  assert.throws(() => validateGoldRegions({ ...cleanBoard, layers: { 'front-copper': [edgePad], 'front-mask': [edgePad] } }, [item], 'front'), /within 0.25 mm/)
  const gerber = '%FSLAX46Y46*%\n%MOMM*%\n%ADD10C,0.500*%\nM02*\n'
  assert.ok(addGerberRegions(gerber, solid).includes('G36*'))
  assert.equal(addGerberRegions(gerber, solid).includes('%LPC*%'), false)
})
