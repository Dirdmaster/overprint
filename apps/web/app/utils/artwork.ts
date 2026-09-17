import { flattenSvgStyles } from './svgStyles'

export type Artwork = {
  nativeSilk?: { baseColor?: string; colors: Record<string, string> }
  kind?: 'layer' | 'folder'; parentId?: string; collapsed?: boolean
  id: string; name: string; side: string; source: string
  x: number; y: number; width: number; height: number; rotation: number; visible: boolean
}

export const MAX_ARTWORK_ITEMS = 100
export const artworkCount = (items: Artwork[]) => items.filter(item => !item?.nativeSilk).length

export const readArtwork = async (file: File) => {
  if (file.size > 2_000_000) throw new Error('SVG exceeds 2 MB. Simplify the graphic before importing.')
  const source = await file.text()
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Remove document declarations from the SVG.')
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Choose a valid SVG graphic.')
  const allowed = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc'])
  if (doc.querySelectorAll('*').length > 10000) throw new Error('SVG has too many shapes. Simplify it before importing.')
  // Exporters include nonvisual RDF/license data. Discard the entire subtree
  // rather than allowing arbitrary metadata elements into persisted artwork.
  for (const metadata of [...doc.getElementsByTagNameNS('http://www.w3.org/2000/svg', 'metadata')]) metadata.remove()
  flattenSvgStyles(doc)
  for (const node of doc.querySelectorAll('*')) {
    if (!allowed.has(node.localName)) throw new Error(`Unsupported SVG element: ${node.localName}. Outline text and expand linked images or effects before importing.`)
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || /href$/i.test(attr.name) || /javascript:|@import|expression\s*\(/i.test(attr.value) || (attr.name === 'style') || (/url\s*\(/i.test(attr.value) && !/^url\(#[\w-]+\)$/.test(attr.value))) throw new Error('SVG contains scripts, styles, or external links. Export a self-contained SVG with presentation attributes.')
    }
  }
  const root = doc.documentElement
  const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  const width = box?.[2] ?? Number(root.getAttribute('width')?.replace(/px$/, ''))
  const height = box?.[3] ?? Number(root.getAttribute('height')?.replace(/px$/, ''))
  if (!Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0 || (box && (box.length !== 4 || !box.every(Number.isFinite)))) throw new Error('SVG needs a valid viewBox or positive pixel width and height.')
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return { source: new XMLSerializer().serializeToString(root), ratio: width! / height! }
}

export const artworkRows = (items: Artwork[], side: string, includeCollapsed = false) => {
  const rows: { item: Artwork; depth: number; visible: boolean }[] = []
  const visit = (parentId: string | undefined, depth: number, visible: boolean) => {
    for (const item of items.filter(item => !item.nativeSilk && item.side === side && item.parentId === parentId)) {
      const shown = visible && item.visible
      rows.push({ item, depth, visible: shown })
      if (item.kind && (includeCollapsed || !item.collapsed)) visit(item.id, depth + 1, shown)
    }
  }
  visit(undefined, 0, true)
  return rows
}
