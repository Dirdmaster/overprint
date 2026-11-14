import ClipperLib from 'clipper-lib'
import type { Artwork } from './artwork'
export type VectorContour = { points: [number, number][]; closed: boolean }
export type VectorDefinition = { version: 1; contours: VectorContour[]; width: number; height: number; fill: string; stroke: string; strokeWidth: number }
export const validateVector = (value: unknown): VectorDefinition => {
  const v = value as VectorDefinition
  const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000
  const color = (c: unknown) => typeof c === 'string' && /^(none|#[a-f\d]{6})$/i.test(c)
  if (!v || v.version !== 1 || !Array.isArray(v.contours) || !v.contours.length || v.contours.length > 256 || !number(v.width) || !number(v.height) || v.width <= 0 || v.height <= 0 || !number(v.strokeWidth) || v.strokeWidth < 0 || v.strokeWidth > 100 || !color(v.fill) || !color(v.stroke) || (v.fill === 'none' && (v.stroke === 'none' || v.strokeWidth === 0))) throw new Error('Invalid vector geometry.')
  let count = 0
  for (const c of v.contours) {
    if (!c || typeof c.closed !== 'boolean' || !Array.isArray(c.points) || c.points.length < (c.closed ? 3 : 2) || !c.points.every(p => Array.isArray(p) && p.length === 2 && p.every(number))) throw new Error('Invalid vector nodes.')
    count += c.points.length
  }
  if (count > 4096) throw new Error('Vectors support at most 4096 nodes.')
  return { version: 1, width: v.width, height: v.height, fill: v.fill, stroke: v.stroke, strokeWidth: v.strokeWidth, contours: v.contours.map(c => ({ closed: c.closed, points: c.points.map(p => [p[0], p[1]]) })) }
}
export const renderVector = (value: VectorDefinition) => {
  const vector = validateVector(value)
  const d = vector.contours.map(c => `M${c.points.map(p => p.join(',')).join(' L')}${c.closed ? ' Z' : ''}`).join(' ')
  return { vector, width: vector.width, height: vector.height, source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vector.width} ${vector.height}"><path d="${d}" fill="${vector.fill}" fill-rule="evenodd" stroke="${vector.stroke}" stroke-width="${vector.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>` }
}
export const POLYGON_SCALE = 100000
export type Ring = [number, number][]
export const polygonArea = (rings: Ring[]) => Math.abs(rings.reduce((sum, ring) => sum + ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]!; return a + p[0] * q[1] - q[0] * p[1] }, 0) / 2, 0))
export const clipPolygons = (subject: Ring[], clip: Ring[], operation: 'union' | 'subtract' | 'intersect'): Ring[] => {
  const integer = (ring: Ring) => ring.map(([x, y]) => ({ X: Math.round(x * POLYGON_SCALE), Y: Math.round(y * POLYGON_SCALE) }))
  const engine = new ClipperLib.Clipper()
  engine.AddPaths(subject.map(integer), ClipperLib.PolyType.ptSubject, true)
  engine.AddPaths(clip.map(integer), ClipperLib.PolyType.ptClip, true)
  const result: ClipperLib.Paths = []
  engine.Execute({ union: ClipperLib.ClipType.ctUnion, subtract: ClipperLib.ClipType.ctDifference, intersect: ClipperLib.ClipType.ctIntersection }[operation], result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return result.map(r => r.map(p => [p.X / POLYGON_SCALE, p.Y / POLYGON_SCALE]))
}
export const vectorFromRings = (rings: Ring[], side: string, fill = '#ffd426') => {
  if (rings.reduce((count, ring) => count + ring.length, 0) > 4096) throw new Error('This shape exceeds the 4096-node editing limit.')
  if (!rings.length) throw new Error('The operation leaves no filled geometry.')
  const points = rings.flat(), x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
  const width = Math.max(...points.map(p => p[0])) - x, height = Math.max(...points.map(p => p[1])) - y
  return { x, y, rotation: 0, ...renderVector({ version: 1, width, height, fill, stroke: 'none', strokeWidth: 0, contours: rings.map(r => ({ closed: true, points: r.map(p => [side === 'back' ? width - (p[0] - x) : p[0] - x, p[1] - y]) })) }) }
}
/** The frozen source has the same aspect-preserving transform as the SVG canvas. */
export const artworkPolygons = async (item: Artwork): Promise<Ring[]> => {
  const doc = new DOMParser().parseFromString(item.source, 'image/svg+xml')
  if (doc.querySelector('[clip-path], [mask], image')) throw new Error('Expand clipped or masked artwork before geometry operations.')
  const root = doc.documentElement
  const box = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number) ?? [0, 0, Number(root.getAttribute('width')), Number(root.getAttribute('height'))]
  const { SVGLoader } = await import('three/examples/jsm/loaders/SVGLoader.js')
  const loaded = new SVGLoader().parse(item.source)
  const scale = Math.min(item.width / box[2]!, item.height / box[3]!)
  const left = item.x + (item.width - box[2]! * scale) / 2, top = item.y + (item.height - box[3]! * scale) / 2
  const angle = item.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), cx = item.x + item.width / 2, cy = item.y + item.height / 2
  const transform = (p: { x: number; y: number }): [number, number] => {
    const x = left + (p.x - box[0]!) * scale
    const dx = (item.side === 'back' ? 2 * cx - x : x) - cx, dy = top + (p.y - box[1]!) * scale - cy
    return [cx + c * dx - s * dy, cy + s * dx + c * dy]
  }
  const rings: Ring[] = []
  for (const path of loaded.paths) {
    const style = path.userData?.style as { fill?: string; fillOpacity?: number } | undefined
    if (style?.fill === 'none' || style?.fillOpacity === 0) continue
    for (const shape of SVGLoader.createShapes(path)) {
      const points = shape.extractPoints(64)
      const orient = (ring: Ring, outer: boolean) => {
        const sign = ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]!; return sum + p[0] * q[1] - q[0] * p[1] }, 0)
        return (sign > 0) === outer ? ring : ring.reverse()
      }
      rings.push(orient(points.shape.map(transform), true), ...points.holes.map(r => orient(r.map(transform), false)))
    }
  }
  if (rings.flat().length > 100000) throw new Error('Artwork geometry is too detailed for this operation.')
  return rings
}
