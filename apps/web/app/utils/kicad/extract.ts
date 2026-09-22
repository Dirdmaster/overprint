import type { BoardPackage } from '../boardPackage'
import { atom, child, children, flag, number, parseSExpr, type SExpr } from './sexpr.ts'
import { circle, transform, type Point, type Ring } from './geometry.ts'
import { position, rotation, unsupported } from './shapes.ts'
import { onLayer, padDrill, padMask, padShape } from './pads.ts'
import { createDrawingReader } from './drawings.ts'
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
  const { drawing, zone } = createDrawingReader(board, geometry)
  const world = (rings: Ring[], origin: Point, angle: number) => rings.map(r => r.map(p => transform(p, origin, angle)))
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
