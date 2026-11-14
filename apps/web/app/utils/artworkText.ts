import { newstrokeGlyph } from './newstroke'
import { offset, unionPaths, type Ring } from './kicad/geometry'
import type { Artwork } from './artwork'

/** Versioned bundled glyphs and filled polygons. No system fonts or network loads. */
export type ArtworkText = {
  version: 1
  content: string
  font: 'newstroke' | 'newstroke-mono'
  size: number
  stroke: number
  tracking: number
  lineHeight: number
  align: 'left' | 'center' | 'right'
  italic: boolean
  color: string
}
export const defaultStrokeText: ArtworkText = {
  version: 1, content: 'Text', font: 'newstroke', size: 1.5, stroke: 0.2,
  tracking: 0.15, lineHeight: 1.6, align: 'left', italic: false, color: '#f4f1e8',
}
export const validateStrokeText = (value: unknown): ArtworkText => {
  const t = value as ArtworkText
  const between = (n: unknown, low: number, high: number) => typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high
  if (!t || t.version !== 1 || typeof t.content !== 'string' || !t.content.trim() || t.content.length > 256 || t.content.split('\n').length > 12 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(t.content)
    || !['newstroke', 'newstroke-mono'].includes(t.font) || !between(t.size, 0.2, 100)
    || !between(t.stroke, 0.02, 10) || t.stroke > t.size || !between(t.tracking, 0, 20)
    || !between(t.lineHeight, 1, 4) || !['left', 'center', 'right'].includes(t.align)
    || typeof t.italic !== 'boolean' || typeof t.color !== 'string' || !/^#[\da-f]{6}$/i.test(t.color)) {
    throw new Error('Use 1–256 characters, up to 12 lines, a 0.2–100 mm size and a positive stroke no wider than the font size.')
  }
  // Copy known fields only. Metadata never supplies executable SVG or font URLs.
  return { version: 1, content: t.content, font: t.font, size: t.size, stroke: t.stroke, tracking: t.tracking, lineHeight: t.lineHeight, align: t.align, italic: t.italic, color: t.color.toLowerCase() }
}
const bounds = (rings: Ring[]) => {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
  for (const ring of rings) for (const point of ring) {
    x = Math.min(x, point[0]); y = Math.min(y, point[1])
    right = Math.max(right, point[0]); bottom = Math.max(bottom, point[1])
  }
  return { x, y, width: right - x, height: bottom - y }
}
export const renderText = (value: ArtworkText) => {
  const text = validateStrokeText(value)
  const glyphs = new Map<string, { rings: Ring[]; advance: number }>()
  const glyph = (character: string) => {
    if (!glyphs.has(character)) {
      const g = newstrokeGlyph(character)
      const advance = (text.font === 'newstroke-mono' ? 1.25 : g.width) * text.size
      const inset = text.font === 'newstroke-mono' ? (advance - g.width * text.size) / 2 : 0
      const strokes = g.strokes.map(ring => ring.map(([x, y]): [number, number] => [inset + x * text.size - (text.italic ? y * text.size / 8 : 0), y * text.size]))
      glyphs.set(character, { rings: offset(strokes, text.stroke / 2, false), advance })
    }
    return glyphs.get(character)!
  }
  const lines = text.content.split('\n').map(line => [...line].map(glyph))
  const widths = lines.map(line => line.reduce((sum, g) => sum + g.advance, 0) + Math.max(0, line.length - 1) * text.tracking)
  const maxWidth = Math.max(...widths)
  const rings: Ring[] = []
  for (const [index, line] of lines.entries()) {
    let cursor = (maxWidth - widths[index]!) * ({ left: 0, center: 0.5, right: 1 }[text.align])
    for (const g of line) {
      for (const ring of g.rings) rings.push(ring.map(([x, y]) => [x + cursor, y + index * text.size * text.lineHeight]))
      cursor += g.advance + text.tracking
    }
  }
  const b = bounds(rings)
  if (!Number.isFinite(b.width) || !Number.isFinite(b.height) || b.width <= 0 || b.height <= 0 || Math.max(b.width, b.height) > 10000) throw new Error('This text has no printable geometry or exceeds the artwork size limit.')
  const normalized = rings.map(ring => ring.map(([x, y]): [number, number] => [x - b.x, y - b.y]))
  const paths = unionPaths(normalized)
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.width} ${b.height}">${paths.map(d => `<path d="${d}" fill="${text.color}" fill-rule="evenodd"/>`).join('')}</svg>`
  if (source.length > 2_000_000) throw new Error('Text exceeds the 2 MB artwork limit. Use fewer characters.')
  return { source, width: b.width, height: b.height, text }
}
/** Measurements include object scaling; nominal font size alone is not a print check. */
export const textMeasurements = (item: Artwork, outlined?: ReturnType<typeof renderText>) => {
  if (!item.text) return undefined
  const original = outlined ?? renderText(item.text)
  const scale = Math.min(item.width / original.width, item.height / original.height)
  return { inkHeight: original.height * scale, stroke: item.text.stroke * scale, size: item.text.size * scale, tracking: item.text.tracking * scale }
}
