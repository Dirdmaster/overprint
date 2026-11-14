import { glyph_data, shared_glyphs } from './kicad/newstroke-glyphs.ts'
import type { Ring } from './kicad/geometry'
type Glyph = { width: number; strokes: Ring[] }
const cache = new Map<string, Glyph>()
export const newstrokeGlyph = (character: string): Glyph => {
  const cached = cache.get(character)
  if (cached) return cached
  const entry = glyph_data[character.codePointAt(0)! - 32]
  const data = typeof entry === 'number' ? shared_glyphs[entry] : entry
  if (!data) throw new Error(`The bundled stroke font does not contain “${character}”. Choose another character.`)
  const left = data.charCodeAt(0) - 82
  const result: Glyph = { width: (data.charCodeAt(1) - 82 - left) / 21, strokes: [] }
  let stroke: Ring = []
  for (let i = 2; i < data.length; i += 2) {
    if (data.slice(i, i + 2) === ' R') { stroke = []; continue }
    if (!stroke.length) result.strokes.push(stroke)
    stroke.push([(data.charCodeAt(i) - 82 - left) / 21, (data.charCodeAt(i + 1) - 90) / 21])
  }
  cache.set(character, result)
  return result
}
