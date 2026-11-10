import { loadGoogleTextFont } from './googleTextFont'
import type { Font } from 'opentype.js'
import { validateText, type TextDefinition } from './textDrawing'
import { readArtwork } from './artwork'
export const outlineText = async (value: TextDefinition) => {
  const drawing = validateText(value)
  if (drawing.font === 'geist-latin-v1') throw new Error('This saved text uses the former bundled Geist font. Choose Geist from Google Fonts to edit it. Existing artwork still displays and exports.')
  const loaded = await loadGoogleTextFont(drawing.google!)
  const font: Font = loaded.font
  drawing.google = loaded.identity
  for (const character of new Set(drawing.content.replaceAll('\n', ''))) {
    if (!font.charToGlyphIndex(character)) throw new Error(`Unsupported glyph “${character}” in ${drawing.google.family}. Choose a supported character.`)
  }
  const lines = drawing.content.split('\n')
  // Google families can contain shaping lookups unsupported by opentype.js 2.
  // Our supported Latin subset uses direct glyphs and kerning, without ligatures.
  const { Path } = await import('opentype.js')
  const layoutLatin = (line: string, x = 0, y = 0) => {
    const path = new Path()
    const glyphs = Array.from(line, character => font.charToGlyph(character))
    let advance = 0
    for (const [index, glyph] of glyphs.entries()) {
      path.extend(glyph.getPath(x + advance, y, drawing.size))
      advance += (glyph.advanceWidth ?? 0) * drawing.size / font.unitsPerEm
      const next = glyphs[index + 1]
      if (next) advance += font.getKerningValue(glyph, next) * drawing.size / font.unitsPerEm
      advance += drawing.letterSpacing
    }
    return { path, advance }
  }
  const advances = lines.map(line => layoutLatin(line).advance)
  const lineWidth = Math.max(...advances)
  const paths = lines.map((line, index) => {
    const x = drawing.align === 'center' ? (lineWidth - advances[index]!) / 2 : drawing.align === 'right' ? lineWidth - advances[index]! : 0
    const y = index * drawing.size * drawing.lineHeight
    return layoutLatin(line, x, y).path
  }).filter(path => path.commands.length)
  const boxes = paths.map(path => path.getBoundingBox())
  const left = Math.min(0, ...boxes.map(box => box.x1))
  const top = Math.min(-font.ascender * drawing.size / font.unitsPerEm, ...boxes.map(box => box.y1))
  const right = Math.max(lineWidth, ...boxes.map(box => box.x2))
  const bottom = Math.max((lines.length - 1) * drawing.size * drawing.lineHeight - font.descender * drawing.size / font.unitsPerEm, ...boxes.map(box => box.y2))
  const width = right - left, height = bottom - top
  if (![width, height].every(n => Number.isFinite(n) && n > .001 && n <= 9990)) throw new Error('Text bounds exceed the supported artwork size.')
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><g transform="translate(${-left} ${-top})" fill="${drawing.fill}">${paths.map(path => `<path d="${path.toPathData(5)}"/>`).join('')}</g></svg>`
  const safe = await readArtwork(new File([source], 'text.svg'))
  return { source: safe.source, width, height, drawing }
}
