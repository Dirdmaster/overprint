import { atom, child, children, type SExpr } from './sexpr.ts'
import { positive, transform, type Point, type Ring } from './geometry.ts'
import { graphic, graphicPolygons, pointList, position, rotation, unsupported } from './shapes.ts'
import { textPolygons } from './text.ts'
import type { BoardGeometry } from './boardGeometry.ts'

/** Read board and footprint graphics, text variables, and saved zone fills. */
export const createDrawingReader = (board: SExpr, geometry: BoardGeometry) => {
  const world = (rings: Ring[], origin: Point, angle: number) => rings.map(r => r.map(p => transform(p, origin, angle)))
  const title = child(board, 'title_block')
  const globals: Record<string, string> = { TITLE: atom(child(title, 'title')), REVISION: atom(child(title, 'rev')), COMPANY: atom(child(title, 'company')), ISSUE_DATE: atom(child(title, 'date')) }
  for (const property of children(board, 'property')) globals[atom(property)] = atom(property, 2)
  const drawing = (node: SExpr, footprint: SExpr = []) => {
    const layer = atom(child(node, 'layer'))
    if (layer !== 'Edge.Cuts' && !geometry.supportsLayer(layer)) return
    const kind = atom(node, 0), origin = position(footprint), angle = rotation(footprint)
    if (['gr_text', 'fp_text', 'property'].includes(kind)) {
      if (layer === 'Edge.Cuts') return unsupported('text on Edge.Cuts')
      const variables = { ...globals }
      for (const p of children(footprint, 'property')) variables[atom(p).toUpperCase()] = atom(p, 2)
      for (const p of children(footprint, 'fp_text')) variables[atom(p).toUpperCase()] = atom(p, 2)
      const textOrigin = transform(position(node), origin, angle)
      let textAngle = rotation(node)
      // KiCad keeps footprint labels upright; its boundary is (-90, 90].
      if (footprint.length && !child(node, 'at').includes('unlocked')) {
        while (textAngle > 90) textAngle -= 180
        while (textAngle <= -90) textAngle += 180
      }
      geometry.addLayer(layer, world(textPolygons(node, variables), textOrigin, textAngle))
      return
    }
    if (layer === 'Edge.Cuts') {
      const shape = graphic(node), points = shape.points.map(p => transform(p, origin, angle))
      geometry.addEdges([shape.closed ? [...points, points[0]!] : points])
    } else geometry.addLayer(layer, world(graphicPolygons(node), origin, angle))
  }
  const zone = (node: SExpr, footprint: SExpr = []) => {
    if (child(node, 'keepout').length) return
    const relevant = [atom(child(node, 'layer')), ...child(node, 'layers').filter((v): v is string => typeof v === 'string')].filter(l => geometry.supportsLayer(l))
    if (!relevant.length) return
    const fills = children(node, 'filled_polygon')
    if (!fills.length) { geometry.warn('Unfilled zones are omitted. Fill zones in KiCad and save the PCB before importing.'); return }
    for (const fill of fills) {
      const layer = atom(child(fill, 'layer')) || relevant[0]!
      // Preserve bridged holes in saved fill contours; do not replace fills with zone boundaries.
      geometry.addLayer(layer, world([positive(pointList(fill))], position(footprint), rotation(footprint)))
    }
  }
  return { drawing, zone }
}
