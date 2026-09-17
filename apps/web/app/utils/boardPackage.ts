import { unzipSync, strFromU8 } from 'fflate'
import { encodeGlb, validateBoardModels, type BoardModels, MAX_MODEL_BYTES } from './boardModels'
import { validateFabrication, type Fabrication } from './fabrication'

export type Polygon = { outer: number[][]; holes: number[][][] }
export type BoardPackage = {
  syncSource?: { url: string; boardId: string }
  name: string
  fabrication?: Fabrication
  models?: BoardModels
  bounds: { x: number; y: number; width: number; height: number }
  outline: string
  holes: string
  layers: Record<string, string[]>
}
const fail = (): never => { throw new Error('Invalid board export. Choose a .overprint-board file from the KiCad plugin.') }
const polygonPath = (value: unknown): string => {
  if (!Array.isArray(value)) return fail()
  return value.map(p => {
    if (!p || !Array.isArray(p.outer) || !Array.isArray(p.holes)) return fail()
    return [p.outer, ...p.holes].map(ring => {
      if (!Array.isArray(ring) || ring.length < 3) return fail()
      return 'M' + ring.map((point: unknown) => {
        if (!Array.isArray(point) || point.length !== 2 || !point.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000)) return fail()
        return point.join(',')
      }).join(' L') + ' Z'
    }).join(' ')
  }).join(' ')
}
export const readBoardPackage = async (file: File): Promise<BoardPackage> => {
  if (file.size > 25_000_000) throw new Error('This board export exceeds the 25 MB limit.')
  try {
    let total = 0
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
      total += entry.originalSize
      if (total > 100_000_000) throw new Error('Expanded board export exceeds 100 MB.')
      if (entry.name === 'models/components.glb' && entry.originalSize > MAX_MODEL_BYTES) throw new Error('Component models exceed the 8 MB limit.')
      return true
    } })
    const read = (name: string) => { const bytes = files[name]; if (!bytes) return fail(); return strFromU8(bytes) }
    const manifest = JSON.parse(read('manifest.json'))
    if (manifest.format !== 'overprint-board' || manifest.version !== 1) throw new Error('Unsupported board package. Export it with the current Overprint plugin.')
    if (manifest.coordinates?.units !== 'mm' || manifest.coordinates?.backDisplay !== 'mirror-x-about-board-center') return fail()
    const b = manifest.board?.boundsMm
    if (!b || !['x', 'y', 'width', 'height'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k]) && Math.abs(b[k]) < 100000) || b.width <= 0 || b.height <= 0) return fail()
    const geometry = JSON.parse(read('geometry.json'))
    if (!Array.isArray(geometry.holes) || !Array.isArray(geometry.pads) || !Array.isArray(geometry.footprints)) return fail()
    const layers: Record<string, string[]> = {}
    for (const side of ['front', 'back']) for (const name of ['silkscreen', 'mask', 'copper', 'fabrication']) {
      const doc = new DOMParser().parseFromString(read(`layers/${side}-${name}.svg`), 'image/svg+xml')
      if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') return fail()
      // Only extract KiCad's polygon paths; never mount imported markup or URLs.
      const paths = [...doc.querySelectorAll('path')].map(p => p.getAttribute('d') ?? '')
      if (!paths.every(d => /^[MLZmlz\d\s.,+eE-]*$/.test(d))) return fail()
      layers[`${side}-${name}`] = paths
    }
    let fabrication: Fabrication | undefined
    if (manifest.fabrication !== undefined) {
      const f = manifest.fabrication
      if (!Array.isArray(f.files) || f.files.length > 80 || new Set(f.files).size !== f.files.length || !f.files.every((name: unknown) => typeof name === 'string' && /^fabrication\/[A-Za-z0-9_-]+\.(gbr|drl)$/.test(name))) return fail()
      const native: Record<string, string> = {}
      for (const name of f.files) {
        if (!files[name]) return fail()
        native[name] = new TextDecoder('utf-8', { fatal: true }).decode(files[name])
      }
      fabrication = validateFabrication({ ...f, files: native })
    }
    let models: BoardModels | undefined
    if (manifest.models !== undefined) {
      const model = manifest.models
      if (model.file !== undefined && model.file !== 'models/components.glb') return fail()
      models = validateBoardModels({ ...model, encoding: model.file ? 'gzip-base64' : undefined, glb: model.file ? encodeGlb(files[model.file] ?? new Uint8Array()) : undefined })
    }
    return { fabrication, models, name: String(manifest.board.name || 'Untitled').slice(0, 200), bounds: b,
      outline: polygonPath(geometry.outlines), holes: geometry.holes.map((h: { polygons: unknown }) => polygonPath(h.polygons)).join(' '), layers }
  } catch (error) {
    if (error instanceof Error && /limit|exceeds|Unsupported|Invalid board|Invalid component/.test(error.message)) throw error
    return fail()
  }
}
