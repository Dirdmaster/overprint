import { renderText } from './artworkText'
import { renderVector } from './vectorArtwork'
import { validatePalette, renderAppearance, type PaletteColor } from './artworkAppearance'
import { validateLibraryInstances } from './library'
import { readArtwork, artworkCount, MAX_ARTWORK_ITEMS, type Artwork } from './artwork'
import { validateDrawing, renderDrawing } from './drawing'
import { validateBoardModels } from './boardModels'
import { validateFabrication } from './fabrication'
import type { BoardPackage } from './boardPackage'
import { isNativeSilk, nativeSilkId } from './nativeSilk'
export type Composition = { version: 1; board: BoardPackage; artwork: Artwork[]; side: string; silk: boolean; mask: string; fabrication: boolean; palette?: PaletteColor[] }
export const assertProjectSize = (text: string) => {
  if (new TextEncoder().encode(text).byteLength > 20_000_000) throw new Error('Project exceeds the 20 MB limit. Remove graphics or component models before saving.')
}
export const parseProject = async (text: string): Promise<Composition> => {
  assertProjectSize(text)
  const p = JSON.parse(text)
  if (p.version !== 1) throw new Error('Unsupported project version.')
  validateProjectBoard(p.board)
  if (p.palette !== undefined) p.palette = validatePalette(p.palette)
  const numeric = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000
  const path = (s: unknown) => typeof s === 'string' && /^[MLZmlz\d\s.,+eE-]*$/.test(s)
  if (!Array.isArray(p.artwork) || p.artwork.length > MAX_ARTWORK_ITEMS + 2 || artworkCount(p.artwork) > MAX_ARTWORK_ITEMS || !['front','back'].includes(p.side) || typeof p.silk !== 'boolean' || typeof p.fabrication !== 'boolean' || !/^#[\da-f]{6}$/i.test(p.mask)) throw new Error('Invalid project settings.')
  const ids = new Set<string>()
  for (const item of p.artwork) {
    if (item?.vector !== undefined) {
      if (item.kind || item.drawing || item.text || item.appearance || item.library || item.gold) throw new Error('Invalid vector metadata combination.')
      const frozen = await readArtwork(new File([renderVector(item.vector).source], 'vector.svg'))
      if ((await readArtwork(new File([item.source], 'vector.svg'))).source !== frozen.source) throw new Error('Vector outlines do not match their nodes.')
    }
    if (item?.appearance !== undefined) {
      if (item.kind || item.drawing || item.text || item.vector || item.library || item.gold) throw new Error('Invalid appearance metadata combination.')
      const frozen = await renderAppearance(item.appearance)
      if ((await readArtwork(new File([item.source], 'appearance.svg'))).source !== (await readArtwork(new File([frozen.source], 'appearance.svg'))).source) throw new Error('Appearance does not match its saved source.')
    }
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string' || typeof item.source !== 'string' || typeof item.visible !== 'boolean' || !['front','back'].includes(item.side) || !['x','y','width','height','rotation'].every(k => numeric(item[k])) || item.width <= 0 || item.height <= 0) throw new Error('Invalid artwork in project.')
    if (item.drawing !== undefined) {
      if (item.kind || item.nativeSilk) throw new Error('Only graphics can have editable metadata.')
      item.drawing = validateDrawing(item.drawing)
      if (item.drawing.type === 'shape') {
        const frozen = await readArtwork(new File([renderDrawing(item.drawing).source], 'shape.svg'))
        const source = await readArtwork(new File([item.source], 'shape.svg'))
        if (source.source !== frozen.source) throw new Error('Editable shape source does not match its geometry.')
      }
    }
    ids.add(item.id)
    if (item.kind !== undefined && !['layer', 'folder'].includes(item.kind)) throw new Error('Invalid layer type.')
    if (item.collapsed !== undefined && typeof item.collapsed !== 'boolean') throw new Error('Invalid layer state.')
    if (item.gold !== undefined) {
      const gold = item.gold
      if (item.kind || !gold || !path(gold.path) || !gold.bounds || !['x', 'y', 'width', 'height'].every(key => numeric(gold.bounds[key])) || gold.bounds.width <= 0 || gold.bounds.height <= 0 || !item.source.includes('data-overprint-fill="true"')) throw new Error('Invalid ENIG artwork.')
    }
    if (item.locked !== undefined && typeof item.locked !== 'boolean') throw new Error('Invalid layer lock state.')
    if (item.nativeSilk !== undefined) {
      const ink = item.nativeSilk
      const color = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
      if (!ink || item.kind !== 'layer' || item.id !== nativeSilkId(item.side) || item.parentId !== undefined || !ink.colors || typeof ink.colors !== 'object' || Array.isArray(ink.colors) || (ink.baseColor !== undefined && !color(ink.baseColor)) || !Object.entries(ink.colors).every(([shape, fill]) => shape.length > 0 && path(shape) && color(fill))) throw new Error('Invalid KiCad ink colors.')
    } else if (isNativeSilk(item.id)) throw new Error('Reserved KiCad layer identifier.')
    if (!item.kind) item.source = (await readArtwork(new File([item.source], 'graphic.svg'))).source
    if (item.text !== undefined) {
      if (item.kind || item.nativeSilk) throw new Error('Text must be an artwork graphic.')
      const generated = renderText(item.text)
      const outlined = await readArtwork(new File([generated.source], 'text.svg'))
      if (item.source !== outlined.source) throw new Error('Editable text does not match its saved outlines.')
      item.text = generated.text
    }
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
  await validateLibraryInstances(p.artwork)
  return p as Composition
}

export const validateProjectBoard = (b: BoardPackage): void => {
  if (b?.anchors !== undefined && (!Array.isArray(b.anchors) || b.anchors.length > 20000 || b.anchors.some(a => !a || !Number.isFinite(a.x) || !Number.isFinite(a.y) || Math.abs(a.x) >= 100000 || Math.abs(a.y) >= 100000 || !['pad', 'footprint'].includes(a.kind) || typeof a.name !== 'string' || a.name.length > 200 || (a.side !== undefined && !['front', 'back'].includes(a.side))))) throw new Error('Invalid board anchors.')
  const numeric = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000
  const path = (s: unknown) => typeof s === 'string' && /^[MLZmlz\d\s.,+eE-]*$/.test(s)
  if (!b || typeof b.name !== 'string' || !b.bounds || !['x','y','width','height'].every(k => numeric(b.bounds[k as keyof typeof b.bounds])) || b.bounds.width <= 0 || b.bounds.height <= 0 || !path(b.outline) || !path(b.holes) || !b.layers || typeof b.layers !== 'object' || !Object.values(b.layers).every(v => Array.isArray(v) && v.every(path))) throw new Error('Invalid board in project.')
  if (b.syncSource !== undefined) {
    const source = b.syncSource
    if (!source || typeof source.url !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(source.url) || typeof source.boardId !== 'string' || !source.boardId || source.boardId.length > 100) throw new Error('Invalid board sync identity.')
  }
  if (b.browserImport !== undefined && (!b.browserImport || !Array.isArray(b.browserImport.warnings) || b.browserImport.warnings.length > 20 || !b.browserImport.warnings.every((warning: unknown) => typeof warning === 'string' && warning.length <= 500))) throw new Error('Invalid PCB import information.')
  if (b.models !== undefined) b.models = validateBoardModels(b.models)
  if (b.fabrication !== undefined) validateFabrication(b.fabrication)
}
