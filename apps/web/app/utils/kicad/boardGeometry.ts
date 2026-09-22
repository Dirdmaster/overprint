import type { BoardPackage } from '../boardPackage'
import { path, round, stitch, union, unionShapePaths, type Ring } from './geometry.ts'

const layerNames: Record<string, string> = Object.fromEntries(['front', 'back'].flatMap((side, i) => ['silkscreen', 'mask', 'copper', 'fabrication'].map((name, j) => [`${i ? 'B' : 'F'}.${['SilkS', 'Mask', 'Cu', 'Fab'][j]}`, `${side}-${name}`])))
const MAX_POINTS = 1_000_000

/** Collect validated geometry and assemble the final board package. */
export const createBoardGeometry = () => {
  const layers: Record<string, Ring[][]> = Object.fromEntries(Object.values(layerNames).map(name => [name, []]))
  const edges: Ring[] = [], holes: Ring[] = [], warnings = new Set<string>()
  let count = 0
  const budget = (rings: Ring[]) => {
    count += rings.reduce((n, r) => n + r.length, 0)
    if (count > MAX_POINTS) throw new Error('This KiCad PCB exceeds the geometry complexity limit.')
    if (rings.some(r => r.some(p => p.some(n => !Number.isFinite(n) || Math.abs(n) >= 100000)))) throw new Error('KiCad geometry has invalid coordinates.')
    return rings
  }
  const addLayer = (layer: string, rings: Ring[]) => {
    const name = layerNames[layer]
    if (name) layers[name]!.push(budget(rings))
  }

  const finish = (filename: string): BoardPackage => {
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
  return {
    supportsLayer: (layer: string) => Boolean(layerNames[layer]),
    addLayer,
    addEdges: (rings: Ring[]) => { edges.push(...budget(rings)) },
    addHoles: (rings: Ring[]) => { holes.push(...budget(rings)) },
    warn: (message: string) => { warnings.add(message) },
    finish,
  }
}

export type BoardGeometry = ReturnType<typeof createBoardGeometry>
