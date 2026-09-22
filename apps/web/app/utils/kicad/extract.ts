import type { BoardPackage } from '../boardPackage'
import { atom, child, children, flag, number, parseSExpr, type SExpr } from './sexpr.ts'
import { circle, path, positive, round, stitch, transform, union, unionShapePaths, type Point, type Ring } from './geometry.ts'
import { graphic, graphicPolygons, point, pointList, position, rotation, unsupported } from './shapes.ts'
import { onLayer, padDrill, padMask, padShape } from './pads.ts'
import { textPolygons } from './text.ts'

const layerNames: Record<string, string> = Object.fromEntries(['front', 'back'].flatMap((side, i) => ['silkscreen', 'mask', 'copper', 'fabrication'].map((name, j) => [`${i ? 'B' : 'F'}.${['SilkS', 'Mask', 'Cu', 'Fab'][j]}`, `${side}-${name}`])))
const MAX_POINTS = 1_000_000
/** Extract a saved PCB without dependencies on KiCad, network access, or DOM APIs. */
export const extractKicadBoard = (text: string, filename: string): BoardPackage => {
  if (new TextEncoder().encode(text).length > 25_000_000) throw new Error('This KiCad PCB exceeds the 25 MB limit.')
  const board = parseSExpr(text)
  // KiCad 6 introduced three-point arcs; legacy and future formats need explicit support.
  const version = Number(atom(child(board, 'version')))
  if (!Number.isInteger(version) || version < 20211014 || version > 20260206) throw new Error('Browser import supports KiCad 6–10 PCB files. Save this PCB in a supported version or use the plugin.')
  const setup = child(board, 'setup')
  const layers: Record<string, Ring[][]> = Object.fromEntries(Object.values(layerNames).map(name => [name, []]))
  const edges: Ring[] = [], holes: Ring[] = [], warnings = new Set<string>()
  let count = 0
  const budget = (rings: Ring[]) => {
    count += rings.reduce((n, r) => n + r.length, 0)
    if (count > MAX_POINTS) throw new Error('This KiCad PCB exceeds the geometry complexity limit.')
    if (rings.some(r => r.some(p => p.some(n => !Number.isFinite(n) || Math.abs(n) >= 100000)))) throw new Error('KiCad geometry has invalid coordinates.')
    return rings
  }
  const add = (layer: string, rings: Ring[]) => {
    const name = layerNames[layer]
    if (name) layers[name]!.push(budget(rings))
  }
  const world = (rings: Ring[], origin: Point, angle: number) => rings.map(r => r.map(p => transform(p, origin, angle)))
  const title = child(board, 'title_block')
  const globals: Record<string, string> = { TITLE: atom(child(title, 'title')), REVISION: atom(child(title, 'rev')), COMPANY: atom(child(title, 'company')), ISSUE_DATE: atom(child(title, 'date')) }
  for (const property of children(board, 'property')) globals[atom(property)] = atom(property, 2)
  const drawing = (node: SExpr, footprint: SExpr = []) => {
    const layer = atom(child(node, 'layer'))
    if (layer !== 'Edge.Cuts' && !layerNames[layer]) return
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
      add(layer, world(textPolygons(node, variables), textOrigin, textAngle))
      return
    }
    if (layer === 'Edge.Cuts') {
      const shape = graphic(node), points = shape.points.map(p => transform(p, origin, angle))
      edges.push(...budget([shape.closed ? [...points, points[0]!] : points]))
    } else add(layer, world(graphicPolygons(node), origin, angle))
  }
  const zone = (node: SExpr, footprint: SExpr = []) => {
    if (child(node, 'keepout').length) return
    const relevant = [atom(child(node, 'layer')), ...child(node, 'layers').filter((v): v is string => typeof v === 'string')].filter(l => layerNames[l])
    if (!relevant.length) return
    const fills = children(node, 'filled_polygon')
    if (!fills.length) { warnings.add('Unfilled zones are omitted. Fill zones in KiCad and save the PCB before importing.'); return }
    for (const fill of fills) {
      const layer = atom(child(fill, 'layer')) || relevant[0]!
      // Preserve bridged holes in saved fill contours; do not replace fills with zone boundaries.
      add(layer, world([positive(pointList(fill))], position(footprint), rotation(footprint)))
    }
  }
  const footprint = (node: SExpr) => {
    if (children(node, 'model').length) warnings.add('Component 3D models are not included in a PCB file. Use the KiCad plugin for assembled previews.')
    for (const item of children(node)) {
      const kind = atom(item, 0)
      if (kind === 'pad') {
        const origin = transform(position(item), position(node), rotation(node))
        // Pad angles are stored in board coordinates, even inside rotated footprints.
        const angle = rotation(item), shape = padShape(item)
        holes.push(...budget(world(padDrill(item), origin, angle)))
        for (const side of ['F', 'B']) {
          if (onLayer(item, `${side}.Cu`)) add(`${side}.Cu`, world(shape, origin, angle))
          if (onLayer(item, `${side}.Mask`)) add(`${side}.Mask`, world(padMask(shape, item, node, setup), origin, angle))
        }
        if (flag(item, 'remove_unused_layers')) warnings.add('Pads with unused copper layers removed are shown on their declared outer layers.')
      } else if (kind === 'zone') zone(item, node)
      else if (kind.startsWith('fp_') || kind === 'property') drawing(item, node)
    }
  }
  const via = (node: SExpr) => {
    const declared = child(node, 'layers').slice(1), through = declared.includes('F.Cu') && declared.includes('B.Cu')
    const origin = position(node), radius = number(child(node, 'size')) / 2, drill = number(child(node, 'drill')) / 2
    if (radius <= 0 || drill <= 0 || drill > radius) throw new Error('Invalid KiCad via dimensions.')
    if (child(node, 'padstack').length) return unsupported('custom via pad stacks')
    if (['filling', 'capping'].some(key => atom(child(node, key)) === 'yes' || atom(child(setup, key)) === 'yes')) warnings.add('Filled or capped vias are previewed as drilled holes. Check the native manufacturing output.')
    if (through) holes.push(...budget([circle(origin, drill)]))
    else warnings.add('Blind and buried via drills are omitted from the surface preview.')
    for (const [side, name] of [['F', 'front'], ['B', 'back']] as const) {
      if (!declared.includes(`${side}.Cu`)) continue
      add(`${side}.Cu`, [circle(origin, radius)])
      const tenting = child(node, 'tenting'), value = atom(child(tenting, name)) || atom(child(child(setup, 'tenting'), name))
      // Resolve saved board defaults before falling back for older files without tenting settings.
      if (value === 'no' || (!tenting.length && child(setup, 'solder_mask_via').length && atom(child(setup, 'solder_mask_via')) === 'yes')) {
        const margin = number(child(node, 'solder_mask_margin'), 1, 0) || number(child(setup, 'pad_to_mask_clearance'), 1, 0)
        if (radius + margin > 0) add(`${side}.Mask`, [circle(origin, radius + margin)])
      } else if (value !== 'yes') warnings.add('Via tenting inherited from the KiCad project is unavailable. Inherited vias are previewed tented.')
    }
  }
  for (const item of children(board)) {
    const kind = atom(item, 0)
    if (kind === 'footprint') footprint(item)
    else if (kind === 'via') via(item)
    else if (kind === 'zone') zone(item)
    else if (kind.startsWith('gr_') || ['segment', 'arc', 'dimension', 'target', 'image'].includes(kind)) drawing(item)
  }
  const outlines = stitch(edges)
  const vertices = outlines.flat(), xs = vertices.map(p => p[0]), ys = vertices.map(p => p[1])
  // Avoid spread into Math.min/max on boards with hundreds of thousands of vertices.
  const min = (values: number[]) => values.reduce((a, b) => Math.min(a, b), Infinity)
  const max = (values: number[]) => values.reduce((a, b) => Math.max(a, b), -Infinity)
  const bounds = { x: round(min(xs)), y: round(min(ys)), width: round(max(xs) - min(xs)), height: round(max(ys) - min(ys)) }
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error('The board outline has no area.')
  // Spatial batches keep detailed imported artwork fast while preserving complete shapes.
  const output = Object.fromEntries(Object.entries(layers).map(([key, rings]) => [key, unionShapePaths(rings)]))
  const result: BoardPackage = { name: filename.replace(/\.kicad_pcb$/i, '').slice(0, 200) || 'Untitled', bounds, outline: path(outlines), holes: path(union(holes)), layers: output,
    browserImport: { warnings: [...warnings] } }
  if (new TextEncoder().encode(JSON.stringify(result)).length > 15_000_000) throw new Error('Extracted KiCad geometry exceeds the 15 MB limit.')
  return result
}
