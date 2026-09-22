import { atom, child, children, number, type SExpr } from './sexpr.ts'
import { arc, circle, distance, offset, positive, type Point, type Ring } from './geometry.ts'
export const point = (node: SExpr): Point => [number(node, 1), number(node, 2)]
export const position = (node: SExpr): Point => child(node, 'at').length ? point(child(node, 'at')) : [0, 0]
export const rotation = (node: SExpr) => number(child(node, 'at'), 3, 0)
export const unsupported = (name: string): never => { throw new Error(`Browser import does not yet support ${name}. Export this board with the KiCad plugin instead.`) }
export const pointList = (node: SExpr): Ring => children(child(node, 'pts')).flatMap(p => {
  if (p[0] === 'xy') return [point(p)]
  if (p[0] === 'arc') return arc(point(child(p, 'start')), point(child(p, 'mid')), point(child(p, 'end')))
  return unsupported('this polygon point type')
})
const bezier = (p: Ring): Ring => {
  if (p.length !== 4) throw new Error('Invalid KiCad Bezier curve.')
  const [a, b, c, d] = p as [Point, Point, Point, Point]
  const result: Ring = [a]
  const subdivide = (a: Point, b: Point, c: Point, d: Point, depth: number) => {
    if (depth > 16) throw new Error('KiCad curve exceeds the geometry limit.')
    if (distance(a, b) + distance(b, c) + distance(c, d) - distance(a, d) < 0.001) { result.push(d); return }
    const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), center = mid(abc, bcd)
    subdivide(a, ab, abc, center, depth + 1); subdivide(center, bcd, cd, d, depth + 1)
  }
  subdivide(a, b, c, d, 0)
  return result
}
export const graphic = (node: SExpr): { points: Ring; closed: boolean } => {
  const kind = atom(node, 0).replace(/^(gr_|fp_)/, '')
  switch (kind) {
    case 'line': case 'segment': return { points: [point(child(node, 'start')), point(child(node, 'end'))], closed: false }
    case 'rect': {
      const a = point(child(node, 'start')), b = point(child(node, 'end'))
      return { points: [a, [b[0], a[1]], b, [a[0], b[1]]], closed: true }
    }
    case 'circle': {
      const center = point(child(node, 'center'))
      return { points: circle(center, distance(center, point(child(node, 'end')))), closed: true }
    }
    case 'arc': return { points: arc(point(child(node, 'start')), point(child(node, 'mid')), point(child(node, 'end'))), closed: false }
    case 'poly': return { points: pointList(node), closed: true }
    case 'curve': return { points: bezier(pointList(node)), closed: false }
    default: return unsupported(kind)
  }
}
export const graphicPolygons = (node: SExpr): Ring[] => {
  const shape = graphic(node), stroke = child(node, 'stroke')
  const width = number(stroke.length ? child(stroke, 'width') : child(node, 'width'), 1, 0)
  const style = atom(child(stroke, 'type'))
  if (style && !['default', 'solid'].includes(style)) return unsupported('dashed graphical strokes')
  const filled = ['solid', 'yes'].includes(atom(child(node, 'fill'))) || (atom(node, 0).endsWith('_poly') && !child(node, 'fill').length)
  const rings: Ring[] = shape.closed && filled ? [positive(shape.points)] : []
  if (width < 0) throw new Error('Invalid negative stroke width in KiCad PCB.')
  if (width > 0) rings.push(...offset([shape.closed ? [...shape.points, shape.points[0]!] : shape.points], width / 2, false))
  return rings
}
