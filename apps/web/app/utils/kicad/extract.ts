import type { BoardPackage } from '../boardPackage'
import { atom, child, children, flag, number, parseSExpr, type SExpr } from './sexpr.ts'
import { circle, positive, transform, type Point, type Ring } from './geometry.ts'
import { graphic, graphicPolygons, point, pointList, position, rotation, unsupported } from './shapes.ts'
import { onLayer, padDrill, padMask, padShape } from './pads.ts'
import { textPolygons } from './text.ts'
import { createBoardGeometry } from './boardGeometry.ts'

/** Extract a saved PCB without dependencies on KiCad, network access, or DOM APIs. */
export const extractKicadBoard = (text: string, filename: string): BoardPackage => {
  if (new TextEncoder().encode(text).length > 25_000_000) throw new Error('This KiCad PCB exceeds the 25 MB limit.')
  const board = parseSExpr(text)
  // KiCad 6 introduced three-point arcs; legacy and future formats need explicit support.
  const version = Number(atom(child(board, 'version')))
  if (!Number.isInteger(version) || version < 20211014 || version > 20260206) throw new Error('Browser import supports KiCad 6–10 PCB files. Save this PCB in a supported version or use the plugin.')
  const setup = child(board, 'setup')
  const geometry = createBoardGeometry()
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
  const footprint = (node: SExpr) => {
    if (children(node, 'model').length) geometry.warn('Component 3D models are not included in a PCB file. Use the KiCad plugin for assembled previews.')
    for (const item of children(node)) {
      const kind = atom(item, 0)
      if (kind === 'pad') {
        const origin = transform(position(item), position(node), rotation(node))
        // Pad angles are stored in board coordinates, even inside rotated footprints.
        const angle = rotation(item), shape = padShape(item)
        geometry.addHoles(world(padDrill(item), origin, angle))
        for (const side of ['F', 'B']) {
          if (onLayer(item, `${side}.Cu`)) geometry.addLayer(`${side}.Cu`, world(shape, origin, angle))
          if (onLayer(item, `${side}.Mask`)) geometry.addLayer(`${side}.Mask`, world(padMask(shape, item, node, setup), origin, angle))
        }
        if (flag(item, 'remove_unused_layers')) geometry.warn('Pads with unused copper layers removed are shown on their declared outer layers.')
      } else if (kind === 'zone') zone(item, node)
      else if (kind.startsWith('fp_') || kind === 'property') drawing(item, node)
    }
  }
  const via = (node: SExpr) => {
    const declared = child(node, 'layers').slice(1), through = declared.includes('F.Cu') && declared.includes('B.Cu')
    const origin = position(node), radius = number(child(node, 'size')) / 2, drill = number(child(node, 'drill')) / 2
    if (radius <= 0 || drill <= 0 || drill > radius) throw new Error('Invalid KiCad via dimensions.')
    if (child(node, 'padstack').length) return unsupported('custom via pad stacks')
    if (['filling', 'capping'].some(key => atom(child(node, key)) === 'yes' || atom(child(setup, key)) === 'yes')) geometry.warn('Filled or capped vias are previewed as drilled holes. Check the native manufacturing output.')
    if (through) geometry.addHoles([circle(origin, drill)])
    else geometry.warn('Blind and buried via drills are omitted from the surface preview.')
    for (const [side, name] of [['F', 'front'], ['B', 'back']] as const) {
      if (!declared.includes(`${side}.Cu`)) continue
      geometry.addLayer(`${side}.Cu`, [circle(origin, radius)])
      const tenting = child(node, 'tenting'), value = atom(child(tenting, name)) || atom(child(child(setup, 'tenting'), name))
      // Resolve saved board defaults before falling back for older files without tenting settings.
      if (value === 'no' || (!tenting.length && child(setup, 'solder_mask_via').length && atom(child(setup, 'solder_mask_via')) === 'yes')) {
        const margin = number(child(node, 'solder_mask_margin'), 1, 0) || number(child(setup, 'pad_to_mask_clearance'), 1, 0)
        if (radius + margin > 0) geometry.addLayer(`${side}.Mask`, [circle(origin, radius + margin)])
      } else if (value !== 'yes') geometry.warn('Via tenting inherited from the KiCad project is unavailable. Inherited vias are previewed tented.')
    }
  }
  for (const item of children(board)) {
    const kind = atom(item, 0)
    if (kind === 'footprint') footprint(item)
    else if (kind === 'via') via(item)
    else if (kind === 'zone') zone(item)
    else if (kind.startsWith('gr_') || ['segment', 'arc', 'dimension', 'target', 'image'].includes(kind)) drawing(item)
  }
  return geometry.finish(filename)
}
