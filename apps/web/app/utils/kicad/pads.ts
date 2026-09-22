import { atom, child, children, number, type SExpr } from './sexpr.ts'
import { circle, offset, positive, rectangle, roundedRect, union, type Point, type Ring } from './geometry.ts'
import { graphicPolygons, point, unsupported } from './shapes.ts'
export const padShape = (node: SExpr): Ring[] => {
  if (child(node, 'padstack').length) return unsupported('custom pad stacks')
  if (child(node, 'chamfer').length) return unsupported('chamfered pads')
  const size = child(node, 'size'), w = number(size, 1), h = number(size, 2)
  if (w <= 0 || h <= 0) throw new Error('Invalid KiCad pad size.')
  const kind = atom(node, 3)
  const shape = (name: string): Ring[] => {
    switch (name) {
      case 'circle': return [circle([0, 0], w / 2)]
      case 'rect': return [rectangle(w, h)]
      case 'oval': return roundedRect(w, h, Math.min(w, h) / 2)
      case 'roundrect': {
        const ratio = number(child(node, 'roundrect_rratio'), 1, 0.25)
        if (ratio < 0 || ratio > 0.5) throw new Error('Invalid rounded pad radius.')
        return roundedRect(w, h, Math.min(w, h) * ratio)
      }
      case 'trapezoid': {
        const delta = child(node, 'rect_delta').length ? point(child(node, 'rect_delta')) : [0, 0]
        const dx = delta[0]! / 2, dy = delta[1]! / 2
        return [positive([[-w / 2 - dy, h / 2 + dx], [w / 2 + dy, h / 2 - dx], [w / 2 - dy, -h / 2 + dx], [-w / 2 + dy, -h / 2 - dx]])]
      }
      default: return unsupported(`pad shape ${name}`)
    }
  }
  const rings = kind === 'custom' ? union([...shape(atom(child(child(node, 'options'), 'anchor')) || 'rect'), ...children(child(node, 'primitives')).flatMap(graphicPolygons)]) : shape(kind)
  const displacement = child(child(node, 'drill'), 'offset')
  const origin: Point = displacement.length ? point(displacement) : [0, 0]
  return rings.map(r => r.map(([x, y]) => [x + origin[0], y + origin[1]]))
}
export const padDrill = (node: SExpr): Ring[] => {
  const drill = child(node, 'drill')
  if (!drill.length) return []
  const oval = atom(drill) === 'oval', w = number(drill, oval ? 2 : 1), h = oval ? number(drill, 3) : w
  if (w <= 0 || h <= 0) throw new Error('Invalid KiCad drill size.')
  return roundedRect(w, h, Math.min(w, h) / 2)
}
export const padMask = (shape: Ring[], pad: SExpr, footprint: SExpr, setup: SExpr) => {
  // KiCad's zero local value inherits the next level, including negative expansions.
  const margin = number(child(pad, 'solder_mask_margin'), 1, 0) || number(child(footprint, 'solder_mask_margin'), 1, 0) || number(child(setup, 'pad_to_mask_clearance'), 1, 0)
  return offset(shape, margin)
}
export const onLayer = (node: SExpr, layer: string) => child(node, 'layers').slice(1).some(value => value === layer || value === `*.${layer.split('.')[1]}` || (value === 'F&B.Cu' && layer.endsWith('.Cu')))
