import { newstrokeGlyph } from '../newstroke.ts'
import { atom, child, flag, number, type SExpr } from './sexpr.ts'
import { offset, type Point, type Ring } from './geometry.ts'
import { unsupported } from './shapes.ts'

/** Newstroke strokes remain filled polygons, so paint and export share the preview. */
export const textPolygons = (node: SExpr, variables: Record<string, string>): Ring[] => {
  const effects = child(node, 'effects'), font = child(effects, 'font')
  if (flag(node, 'hide') || flag(effects, 'hide')) return []
  const face = atom(child(font, 'face'))
  if (face && face !== 'KiCad Font') return unsupported(`the font “${face}”`)
  let text = atom(node, ['fp_text', 'property'].includes(atom(node, 0)) ? 2 : 1)
  text = text.replace(/\$\{([^}]+)\}/g, (_, key: string) => variables[key] ?? unsupported(`the text variable ${key}`))
  if (/[~^_]\{/.test(text)) return unsupported('text overbars, superscripts, or subscripts')
  if (text.length > 10000) throw new Error('KiCad text exceeds the length limit.')
  const size = child(font, 'size'), height = number(size, 1), width = number(size, 2)
  if (height <= 0 || width <= 0) throw new Error('Invalid KiCad text size.')
  const thickness = number(child(font, 'thickness'), 1, Math.min(height, width) / (flag(font, 'bold') ? 5 : 8))
  if (thickness <= 0) throw new Error('Invalid KiCad text thickness.')
  const justify = child(effects, 'justify'), mirror = justify.includes('mirror') ? -1 : 1
  const lines = text.split('\n'), pitch = height * 1.62
  const totalHeight = height * 1.17 + (lines.length - 1) * pitch
  const baseline = height - thickness * 0.052 - (justify.includes('top') ? 0 : justify.includes('bottom') ? totalHeight : totalHeight / 2)
  const strokes: Ring[] = []
  for (const [index, line] of lines.entries()) {
    const glyphs = [...line].map(c => c === '\t' ? { width: 2.4, strokes: [] } : newstrokeGlyph(c))
    const length = glyphs.reduce((n, g) => n + g.width * width, 0)
    let cursor = justify.includes('left') ? thickness / 1.52 : justify.includes('right') ? -length - thickness / 1.52 : -length / 2
    for (const g of glyphs) {
      for (const stroke of g.strokes) strokes.push(stroke.map(([x, y]): Point => [(cursor + x * width - (flag(font, 'italic') ? y * height / 8 : 0)) * mirror, baseline + index * pitch + y * height]))
      cursor += g.width * width
    }
  }
  return offset(strokes, thickness / 2, false)
}
