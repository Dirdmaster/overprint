import { readArtwork, type Artwork } from './artwork'
import { renderText } from './artworkText'
import { renderDrawing } from './drawing'
import { renderVector } from './vectorArtwork'
export type PaletteColor = { name: string; color: string }
export type AppearanceDefinition = { version: 1; kind: 'gradient' | 'stripes' | 'dots'; colors: [string, string]; scale: number; angle: number; base: string }
export const validatePalette = (value: unknown): PaletteColor[] => {
  if (!Array.isArray(value) || value.length > 32 || value.some(c => !c || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 80 || typeof c.color !== 'string' || !/^#[a-f\d]{6}$/i.test(c.color))) throw new Error('A palette supports up to 32 named hex colors.')
  return value.map(c => ({ name: c.name, color: c.color.toLowerCase() }))
}
export const renderAppearance = async (value: AppearanceDefinition) => {
  const a = value
  if (!a || a.version !== 1 || !['gradient', 'stripes', 'dots'].includes(a.kind) || !Array.isArray(a.colors) || a.colors.length !== 2 || !a.colors.every(c => typeof c === 'string' && /^#[a-f\d]{6}$/i.test(c)) || !Number.isFinite(a.scale) || a.scale < .1 || a.scale > 100 || !Number.isFinite(a.angle) || Math.abs(a.angle) > 360 || typeof a.base !== 'string') throw new Error('Invalid fill appearance.')
  const base = await readArtwork(new File([a.base], 'appearance.svg'))
  const doc = new DOMParser().parseFromString(base.source, 'image/svg+xml'), root = doc.documentElement, ns = root.namespaceURI!
  const id = 'overprint-appearance'
  for (const node of [...root.querySelectorAll('*')]) if (node.id === id) throw new Error('This SVG already uses the appearance identifier.')
  const defs = doc.createElementNS(ns, 'defs'), spec = doc.createElementNS(ns, a.kind === 'gradient' ? 'linearGradient' : 'pattern')
  spec.setAttribute('id', id)
  if (a.kind === 'gradient') {
    spec.setAttribute('gradientTransform', `rotate(${a.angle} .5 .5)`)
    for (const [index, color] of a.colors.entries()) { const stop = doc.createElementNS(ns, 'stop'); stop.setAttribute('offset', String(index)); stop.setAttribute('stop-color', color); spec.appendChild(stop) }
  } else {
    spec.setAttribute('patternUnits', 'userSpaceOnUse'); spec.setAttribute('width', String(a.scale)); spec.setAttribute('height', String(a.scale)); spec.setAttribute('patternTransform', `rotate(${a.angle})`)
    const background = doc.createElementNS(ns, 'rect'); background.setAttribute('width', String(a.scale)); background.setAttribute('height', String(a.scale)); background.setAttribute('fill', a.colors[0]); spec.appendChild(background)
    const motif = doc.createElementNS(ns, a.kind === 'dots' ? 'circle' : 'rect')
    if (a.kind === 'dots') { motif.setAttribute('cx', String(a.scale / 2)); motif.setAttribute('cy', String(a.scale / 2)); motif.setAttribute('r', String(a.scale / 4)) }
    else { motif.setAttribute('width', String(a.scale / 2)); motif.setAttribute('height', String(a.scale)) }
    motif.setAttribute('fill', a.colors[1]); spec.appendChild(motif)
  }
  for (const node of root.querySelectorAll('path,rect,ellipse,circle,polygon,polyline')) if (!node.closest('defs,mask,clipPath') && node.getAttribute('fill') !== 'none') node.setAttribute('fill', `url(#${id})`)
  defs.appendChild(spec); root.prepend(defs)
  return { source: new XMLSerializer().serializeToString(root), appearance: { version: 1, kind: a.kind, colors: [...a.colors], scale: a.scale, angle: a.angle, base: base.source } as AppearanceDefinition }
}
export const replaceArtworkColor = async (item: Artwork, from: string, to: string): Promise<Artwork> => {
  const same = (c?: string) => c?.toLowerCase() === from.toLowerCase()
  if (item.nativeSilk) return { ...item, nativeSilk: { baseColor: same(item.nativeSilk.baseColor) ? to : item.nativeSilk.baseColor, colors: Object.fromEntries(Object.entries(item.nativeSilk.colors).map(([path, color]) => [path, same(color) ? to : color])) } }
  const doc = new DOMParser().parseFromString(item.source, 'image/svg+xml')
  let changed = false
  for (const node of doc.querySelectorAll('*')) for (const attr of ['fill', 'stroke', 'stop-color']) if (same(node.getAttribute(attr) ?? undefined)) { node.setAttribute(attr, to); changed = true }
  if (!changed) return item
  if (item.library || item.locked) throw new Error('Detach linked artwork and unlock affected layers before replacing colors.')
  const next: Artwork = { ...item, source: new XMLSerializer().serializeToString(doc.documentElement) }
  if (item.text && same(item.text.color)) { const text = { ...item.text, color: to }; next.text = text; next.source = renderText(text).source }
  if (item.drawing) { const drawing = { ...item.drawing, fill: same(item.drawing.fill) ? to : item.drawing.fill }; if (drawing.type === 'shape') { drawing.stroke = same(drawing.stroke) ? to : drawing.stroke; next.source = renderDrawing(drawing).source }; next.drawing = drawing }
  if (item.vector) { const vector = { ...item.vector, fill: same(item.vector.fill) ? to : item.vector.fill, stroke: same(item.vector.stroke) ? to : item.vector.stroke }; next.vector = vector; next.source = renderVector(vector).source }
  if (item.appearance) { const base = await replaceArtworkColor({ ...item, appearance: undefined, source: item.appearance.base }, from, to); Object.assign(next, await renderAppearance({ ...item.appearance, base: base.source, colors: item.appearance.colors.map(c => same(c) ? to : c) as [string, string] })) }
  return next
}
