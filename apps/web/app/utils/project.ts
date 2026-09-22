import { readArtwork, artworkCount, MAX_ARTWORK_ITEMS, type Artwork } from './artwork'
import { validateBoardModels } from './boardModels'
import { validateFabrication } from './fabrication'
import type { BoardPackage } from './boardPackage'
import { isNativeSilk, nativeSilkId } from './nativeSilk'
export type Composition = { version: 1; board: BoardPackage; artwork: Artwork[]; side: string; silk: boolean; mask: string; fabrication: boolean }
export const assertProjectSize = (text: string) => {
  if (new TextEncoder().encode(text).byteLength > 20_000_000) throw new Error('Project exceeds the 20 MB limit. Remove graphics or component models before saving.')
}
export const parseProject = async (text: string): Promise<Composition> => {
  assertProjectSize(text)
  const p = JSON.parse(text)
  if (p.version !== 1) throw new Error('Unsupported project version.')
  const b = p.board
  const numeric = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000
  const path = (s: unknown) => typeof s === 'string' && /^[MLZmlz\d\s.,+eE-]*$/.test(s)
  if (!b || typeof b.name !== 'string' || !b.bounds || !['x','y','width','height'].every(k => numeric(b.bounds[k])) || b.bounds.width <= 0 || b.bounds.height <= 0 || !path(b.outline) || !path(b.holes) || !b.layers || typeof b.layers !== 'object' || !Object.values(b.layers).every(v => Array.isArray(v) && v.every(path))) throw new Error('Invalid board in project.')
  if (b.syncSource !== undefined) {
    const source = b.syncSource
    if (!source || typeof source.url !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(source.url) || typeof source.boardId !== 'string' || !source.boardId || source.boardId.length > 100) throw new Error('Invalid board sync identity.')
  }
  if (b.browserImport !== undefined && (!b.browserImport || !Array.isArray(b.browserImport.warnings) || b.browserImport.warnings.length > 20 || !b.browserImport.warnings.every((warning: unknown) => typeof warning === 'string' && warning.length <= 500))) throw new Error('Invalid PCB import information.')
  if (b.models !== undefined) b.models = validateBoardModels(b.models)
  if (b.fabrication !== undefined) validateFabrication(b.fabrication)
  if (!Array.isArray(p.artwork) || p.artwork.length > MAX_ARTWORK_ITEMS + 2 || artworkCount(p.artwork) > MAX_ARTWORK_ITEMS || !['front','back'].includes(p.side) || typeof p.silk !== 'boolean' || typeof p.fabrication !== 'boolean' || !/^#[\da-f]{6}$/i.test(p.mask)) throw new Error('Invalid project settings.')
  const ids = new Set<string>()
  for (const item of p.artwork) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string' || typeof item.source !== 'string' || typeof item.visible !== 'boolean' || !['front','back'].includes(item.side) || !['x','y','width','height','rotation'].every(k => numeric(item[k])) || item.width <= 0 || item.height <= 0) throw new Error('Invalid artwork in project.')
    ids.add(item.id)
    if (item.kind !== undefined && !['layer', 'folder'].includes(item.kind)) throw new Error('Invalid layer type.')
    if (item.collapsed !== undefined && typeof item.collapsed !== 'boolean') throw new Error('Invalid layer state.')
    if (item.nativeSilk !== undefined) {
      const ink = item.nativeSilk
      const color = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
      if (!ink || item.kind !== 'layer' || item.id !== nativeSilkId(item.side) || item.parentId !== undefined || !ink.colors || typeof ink.colors !== 'object' || Array.isArray(ink.colors) || (ink.baseColor !== undefined && !color(ink.baseColor)) || !Object.entries(ink.colors).every(([shape, fill]) => shape.length > 0 && path(shape) && color(fill))) throw new Error('Invalid KiCad ink colors.')
    } else if (isNativeSilk(item.id)) throw new Error('Reserved KiCad layer identifier.')
    if (!item.kind) item.source = (await readArtwork(new File([item.source], 'graphic.svg'))).source
  }
  for (const item of p.artwork) {
    const seen = new Set([item.id])
    let parentId = item.parentId
    while (parentId !== undefined) {
      const parent = p.artwork.find((candidate: Artwork) => candidate.id === parentId)
      if (!parent?.kind || parent.nativeSilk || parent.side !== item.side || seen.has(parentId)) throw new Error('Invalid layer hierarchy.')
      seen.add(parentId); parentId = parent.parentId
    }
  }
  return p as Composition
}
