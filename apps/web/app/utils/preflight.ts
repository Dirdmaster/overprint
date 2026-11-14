import type { Composition } from './project'
import type { Artwork } from './artwork'
import { artworkRows } from './artwork'
import { artworkPolygons, clipPolygons, polygonArea, type Ring } from './vectorArtwork'
import { offset, path } from './kicad/geometry'
export const printProfile = {
  id: 'jlcpcb-legend-guidance-2026-10-28', name: 'JLCPCB legend guidance', minimumLine: .15, minimumText: 1, padClearance: .15, edgeMargin: .2,
  source: 'https://jlcpcb.com/capabilities/pcb-', checkedAt: '2026-10-28',
  note: 'Legend limits are advisory for full-color artwork. The 0.20 mm edge margin is an Overprint review target. Geometry sampling and thin-feature screening do not certify print quality.',
}
export type PrintFinding = { id: string; code: string; severity: 'warning' | 'blocker'; message: string; itemId?: string; side: string; bounds: { x: number; y: number; width: number; height: number }; geometry?: string }
export const nativePolygonRings = (paths: string[]): Ring[] => {
  const result: Ring[] = []
  for (const source of paths) {
    let cursor: [number, number] = [0, 0], start = cursor, ring: Ring = []
    for (const match of source.matchAll(/([MLZmlz])([^MLZmlz]*)/g)) {
      const command = match[1]!, values = [...match[2]!.matchAll(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)].map(n => Number(n[0]))
      if (/z/i.test(command)) { if (ring.length > 2) result.push(ring); ring = []; cursor = start; continue }
      if (/m/i.test(command) && ring.length) { if (ring.length > 2) result.push(ring); ring = [] }
      for (let i = 0; i + 1 < values.length; i += 2) { cursor = [values[i]! + (command === command.toLowerCase() ? cursor[0] : 0), values[i + 1]! + (command === command.toLowerCase() ? cursor[1] : 0)]; if (!ring.length) start = cursor; ring.push(cursor) }
    }
    if (ring.length > 2) result.push(ring)
  }
  return result
}
const ringBounds = (rings: Ring[], fallback: Artwork) => {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
  for (const ring of rings) for (const p of ring) { x = Math.min(x, p[0]); y = Math.min(y, p[1]); right = Math.max(right, p[0]); bottom = Math.max(bottom, p[1]) }
  return Number.isFinite(x) ? { x, y, width: Math.max(.01, right - x), height: Math.max(.01, bottom - y) } : { x: fallback.x, y: fallback.y, width: fallback.width, height: fallback.height }
}
export const createPrintReport = async (project: Composition) => {
  const findings: PrintFinding[] = [], b = project.board.bounds
  const add = (item: Artwork | undefined, code: string, message: string, rings: Ring[] = [], severity: 'warning'|'blocker' = 'warning') => findings.push({ id: `${item?.id ?? 'board'}:${code}`, code, severity, message, side: item?.side ?? project.side, itemId: item?.id, bounds: item ? ringBounds(rings, item) : b, ...(rings.length ? { geometry: path(rings) } : {}) })
  if (!project.board.fabrication) add(undefined, 'native-manufacturing-missing', 'Native Gerbers and drill files are required for manufacturing export.', [], 'blocker')
  const outline = nativePolygonRings([project.board.outline]), inner = offset(outline, -printProfile.edgeMargin)
  const pads = Object.fromEntries(['front', 'back'].map(side => [side, nativePolygonRings(project.board.layers[`${side}-mask`] ?? [])]))
  for (const side of ['front', 'back']) for (const { item, visible } of artworkRows(project.artwork, side, true)) {
    if (!visible || item.kind) continue
    try {
      if (item.vector && item.vector.stroke !== 'none' && item.vector.strokeWidth * item.width / item.vector.width < printProfile.minimumLine) add(item, 'thin-stroke', 'Stroke is below the 0.15 mm legend guidance target.')
      const rings = await artworkPolygons(item), bounds = ringBounds(rings, item)
      if (!rings.length) { if (item.drawing?.type === 'shape' && item.drawing.stroke !== 'none' && item.drawing.strokeWidth * item.width / (item.drawing.width + item.drawing.strokeWidth) < printProfile.minimumLine) add(item, 'thin-stroke', 'Stroke is below the 0.15 mm legend guidance target.'); continue }
      if (polygonArea(clipPolygons(rings, outline, 'subtract')) > .0001) add(item, 'outside-board', 'Artwork extends beyond the board and will be clipped.', rings)
      else if (polygonArea(clipPolygons(rings, inner, 'subtract')) > .0001) add(item, 'edge-proximity', 'Artwork is within the 0.20 mm review margin of the board edge.', rings)
      if (pads[side]?.length && polygonArea(clipPolygons(rings, offset(pads[side]!, printProfile.padClearance), 'intersect')) > .0001) add(item, 'pad-clearance', 'Ink overlaps a pad opening or its 0.15 mm clearance region.', rings)
      const lines = item.text?.content.split('\n').filter(Boolean).length ?? (item.drawing?.type === 'text' ? item.drawing.content.split('\n').filter(Boolean).length : 0)
      if (lines && bounds.height / lines < printProfile.minimumText) add(item, 'small-text', `Average text-line ink height ${(bounds.height / lines).toFixed(2)} mm is below the 1.00 mm legend target.`, rings)
      const eroded = offset(rings, -printProfile.minimumLine / 2)
      const restored = eroded.length ? offset(eroded, printProfile.minimumLine / 2) : []
      if (!eroded.length || polygonArea(clipPolygons(rings, restored, 'subtract')) / Math.max(.000001, polygonArea(rings)) > .12) add(item, 'thin-feature', 'Geometry contains a thin-feature candidate below 0.15 mm. Increase stroke or use a heavier font.', rings)
      const signedArea = (r: Ring) => r.reduce((sum, p, i) => { const q = r[(i + 1) % r.length]!; return sum + p[0] * q[1] - q[0] * p[1] }, 0)
      const counters = rings.filter(r => signedArea(r) < 0)
      if (counters.some(r => !offset([[...r].reverse()], -printProfile.minimumLine / 2).length)) add(item, 'small-counter', 'An enclosed counter may close at the 0.15 mm review scale.', rings)
      const components = rings.filter(r => signedArea(r) > 0)
      if (components.length > 1 && offset(components, printProfile.minimumLine / 2).filter(r => signedArea(r) > 0).length < components.length) add(item, 'small-gap', 'Separate ink regions approach within the 0.15 mm review scale.', rings)
    } catch (e) { add(item, 'geometry-not-analyzed', `Geometry could not be fully checked: ${e instanceof Error ? e.message : 'unsupported graphic'}`) }
  }
  return { format: 'overprint-print-review', version: 1, generatedAt: new Date().toISOString(), board: project.board.name, profile: printProfile, findings, scope: 'Artwork geometry review. Native circuit DRC, physical color matching, optical fit and fabricator approval remain separate.' }
}
