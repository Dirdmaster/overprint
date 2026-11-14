import type { Artwork } from './artwork'
import { renderDrawing } from './drawing'
import { renderVector } from './vectorArtwork'
import { renderText } from './artworkText'
/** Solid fill changes preserve editable settings and the physical artwork frame. */
export const editablePaintPatch = (item: Artwork, color: string): Partial<Artwork> | undefined => {
  if (item.drawing) {
    if (item.drawing.fill.toLowerCase() === color.toLowerCase()) return
    const drawing = { ...item.drawing, fill: color }
    if (drawing.type === 'shape') return { drawing, source: renderDrawing(drawing).source }
    const doc = new DOMParser().parseFromString(item.source, 'image/svg+xml')
    for (const node of [doc.documentElement, ...doc.querySelectorAll('*')]) {
      const fill = node.getAttribute('fill')
      if (fill && fill !== 'none') node.setAttribute('fill', color)
    }
    return { drawing, source: new XMLSerializer().serializeToString(doc.documentElement) }
  }
  if (item.vector) {
    if (item.vector.fill.toLowerCase() === color.toLowerCase()) return
    const rendered = renderVector({ ...item.vector, fill: color })
    return { vector: rendered.vector, source: rendered.source }
  }
  if (item.text) {
    if (item.text.color.toLowerCase() === color.toLowerCase()) return
    const rendered = renderText({ ...item.text, color })
    return { text: rendered.text, source: rendered.source }
  }
}
