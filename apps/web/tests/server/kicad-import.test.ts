import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { extractKicadBoard } from '../../app/utils/kicad/extract.ts'
import { parseSExpr } from '../../app/utils/kicad/sexpr.ts'
import { arc, stitch, type Ring } from '../../app/utils/kicad/geometry.ts'

const fixture = readFileSync(new URL('../fixtures/browser-import.kicad_pcb', import.meta.url), 'utf8')
const native = JSON.parse(readFileSync(new URL('../fixtures/browser-import-native.json', import.meta.url), 'utf8')) as Record<string, { outer: Ring; holes: Ring[] }[]>
const rings = (paths: string[]): Ring[] => paths.flatMap(path => path.split('M').slice(1).map(r => [...r.matchAll(/([-\d.e+]+),([-\d.e+]+)/g)].map(m => [Number(m[1]), Number(m[2])] as [number, number])))
const area = (r: Ring) => r.reduce((sum, [x, y], i) => { const next = r[(i + 1) % r.length]!; return sum + x * next[1] - next[0] * y }, 0) / 2
const bounds = (rs: Ring[]) => {
  const points = rs.flat()
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]
}

test('matches native KiCad polygons for mirrored text, rotated pads, roundrects, mask margins and slotted pads', () => {
  const board = extractKicadBoard(fixture, 'browser-import.kicad_pcb')
  assert.equal(board.name, 'browser-import')
  assert.deepEqual(board.bounds, { x: 10, y: 20, width: 60, height: 40 })
  assert.equal(rings([board.outline]).length, 2, 'internal board cutout is preserved')
  assert.equal(rings([board.holes]).length, 2, 'two slots are preserved')
  assert.equal(board.fabrication, undefined)
  assert.equal(board.models, undefined)
  for (const [layer, polygons] of Object.entries(native)) {
    const extracted = rings(layer === 'holes' ? [board.holes] : board.layers[layer]!)
    const expected = polygons.flatMap(p => [p.outer, ...p.holes])
    const extractedBounds = bounds(extracted), nativeBounds = bounds(expected)
    const contours = (rs: Ring[]) => rs.map(r => ({ ring: r, box: bounds([r]) }))
    const inside = (cs: ReturnType<typeof contours>, x: number, y: number) => {
      let odd = false
      for (const { ring: r, box: b } of cs) {
        if (x < b[0]! || x > b[2]! || y < b[1]! || y > b[3]!) continue
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const a = r[i]!, b = r[j]!
          if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) odd = !odd
        }
      }
      return odd
    }
    // Bounds/area alone cannot detect mirrored or upside-down footprint labels.
    const actualContours = contours(extracted), nativeContours = contours(expected)
    let disagreement = 0, occupied = 0
    for (let x = 10.031; x < 70; x += 0.1) for (let y = 20.043; y < 60; y += 0.1) {
      const actual = inside(actualContours, x, y), expected = inside(nativeContours, x, y)
      if (actual || expected) occupied++
      if (actual !== expected) disagreement++
    }
    assert.ok(disagreement / occupied < 0.025, `${layer} contour coverage differs from native KiCad: ${disagreement}/${occupied}`)
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(extractedBounds[i]! - nativeBounds[i]!) < 0.025, `${layer} bounds: ${extractedBounds} != ${nativeBounds}`)
    const extractedArea = Math.abs(extracted.reduce((sum, r) => sum + area(r), 0))
    const nativeArea = polygons.reduce((sum, p) => sum + Math.abs(area(p.outer)) - p.holes.reduce((n, h) => n + Math.abs(area(h)), 0), 0)
    assert.ok(Math.abs(extractedArea - nativeArea) / nativeArea < 0.03, `${layer} area: ${extractedArea} != ${nativeArea}`)
  }
})

const simple = (content: string) => `(kicad_pcb (version 20260206) (gr_rect (start 0 0) (end 20 10) (layer "Edge.Cuts")) ${content})`
test('unions overlapping silk without punching holes and retains separate editable objects', () => {
  const board = extractKicadBoard(simple(`
    (gr_rect (start 1 1) (end 5 5) (fill solid) (layer "F.SilkS"))
    (gr_rect (start 3 1) (end 7 5) (fill solid) (layer "F.SilkS"))
    (gr_rect (start 10 1) (end 12 3) (fill solid) (layer "F.SilkS"))`), 'overlap.KICAD_PCB')
  assert.equal(board.layers['front-silkscreen']!.length, 2)
  assert.equal(rings(board.layers['front-silkscreen']!).reduce((sum, r) => sum + Math.abs(area(r)), 0), 28)
})

test('assembles unordered reversed edges and approximates an arc through its midpoint', () => {
  assert.equal(stitch([[[0, 0], [10, 0]], [[0, 10], [10, 10]], [[0, 0], [0, 10]], [[10, 0], [10, 10]]]).length, 1)
  const points = arc([0, 0], [5, -5], [10, 0])
  assert.ok(Math.min(...points.map(p => p[1])) < -4.995)
  assert.throws(() => stitch([[[0, 0], [10, 0]]]), /closed/)
})

test('reads saved zone fills, never substitutes the unfilled boundary, and reports project-only via settings', () => {
  const board = extractKicadBoard(simple(`
    (zone (layer "F.Cu") (polygon (pts (xy 0 0) (xy 20 0) (xy 20 10))))
    (zone (layer "B.Cu") (filled_polygon (layer "B.Cu") (pts (xy 2 2) (xy 5 2) (xy 5 5) (xy 2 5))))
    (via (at 10 5) (size 1) (drill 0.5) (layers "F.Cu" "B.Cu"))`), 'zones.kicad_pcb')
  assert.ok(board.browserImport!.warnings.some(w => w.includes('Unfilled zones')))
  assert.ok(board.browserImport!.warnings.some(w => w.includes('tenting')))
  assert.equal(board.layers['front-mask']!.length, 0)
  assert.equal(board.layers['back-copper']!.length, 2)
})

test('rejects malformed, oversized, unsupported and incomplete boards rather than displaying partial geometry', () => {
  for (const value of ['(kicad_pcb', '(kicad_pcb))', '(kicad_pcb)(other)', '(kicad_pcb "unterminated)', '(kicad_sch)']) assert.throws(() => parseSExpr(value), /Invalid/)
  assert.deepEqual(parseSExpr('(kicad_pcb (property "a" "a \\"quoted\\" (value)"))')[1], ['property', 'a', 'a "quoted" (value)'])
  assert.throws(() => parseSExpr('('.repeat(101)), /nesting/)
  assert.throws(() => extractKicadBoard(' '.repeat(25_000_001), 'huge.kicad_pcb'), /25 MB/)
  assert.throws(() => extractKicadBoard('(kicad_pcb (version 20171130))', 'legacy.kicad_pcb'), /6–10/)
  assert.throws(() => extractKicadBoard('(kicad_pcb (version 20260206))', 'no-outline.kicad_pcb'), /Edge.Cuts/)
  assert.throws(() => extractKicadBoard(simple('(gr_text "Hello" (at 5 5) (layer "F.SilkS") (effects (font (face "Arial") (size 1 1))))'), 'font.kicad_pcb'), /font.*Arial/)
  assert.throws(() => extractKicadBoard(simple('(gr_rect (start NaN 0) (end 5 5) (layer "F.SilkS"))'), 'nan.kicad_pcb'), /numeric/)
})

test('imports a 28,000-polygon artwork footprint within the worker time budget', () => {
  const polygons = Array.from({ length: 28000 }, (_, i) => {
    const x = i % 200 * 0.2, y = Math.floor(i / 200) * 0.2
    return `(fp_poly (pts (xy ${x} ${y}) (xy ${x + 0.15} ${y}) (xy ${x} ${y + 0.15})) (stroke (width 0) (type solid)) (fill yes) (layer "F.SilkS"))`
  })
  const input = `(kicad_pcb (version 20260206) (gr_rect (start 0 0) (end 50 40) (layer "Edge.Cuts")) (footprint "Synthetic artwork" (at 0 0) ${polygons.join(' ')}))`
  const start = performance.now()
  const board = extractKicadBoard(input, 'artwork.kicad_pcb')
  assert.equal(board.layers['front-silkscreen']!.length, 28000)
  assert.ok(performance.now() - start < 10000, 'Detailed artwork must leave headroom under the 30-second browser deadline')
})

test('spatial unions preserve holes and overlaps across batch boundaries', async () => {
  const { unionShapePaths, unionPaths, rectangle } = await import('../../app/utils/kicad/geometry.ts')
  const Clipper = (await import('clipper-lib')).default
  const shapes = Array.from({ length: 260 }, (_, i) => {
    const x = i % 20 * 1.2, y = Math.floor(i / 20) * 1.2
    return [rectangle(2, 2), rectangle(1, 1).reverse()].map(r => r.map(([px, py]) => [px + x, py + y] as [number, number]))
  })
  // This large hollow shape spans multiple spatial batches; its hole must stay attached.
  shapes.push([rectangle(60, 60), rectangle(58, 58).reverse()])
  const expected = rings(unionPaths(shapes.flat())), actual = rings(unionShapePaths(shapes))
  const integers = (rs: Ring[]) => rs.map(r => r.map(([x, y]) => ({ X: Math.round(x * 100000), Y: Math.round(y * 100000) })))
  const clipper = new Clipper.Clipper(), delta: ClipperLib.Paths = []
  clipper.AddPaths(integers(expected), Clipper.PolyType.ptSubject, true)
  clipper.AddPaths(integers(actual), Clipper.PolyType.ptClip, true)
  clipper.Execute(Clipper.ClipType.ctXor, delta, Clipper.PolyFillType.pftEvenOdd, Clipper.PolyFillType.pftEvenOdd)
  assert.equal(delta.length, 0, 'Batching must not change the filled region')
})
