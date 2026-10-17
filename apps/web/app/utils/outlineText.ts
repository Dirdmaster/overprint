import type { Font } from 'opentype.js'
import regularUrl from '../assets/text-fonts/geist-latin-400-normal.woff?url'
import boldUrl from '../assets/text-fonts/geist-latin-700-normal.woff?url'
import { validateText, type TextDefinition } from './textDrawing'
import { readArtwork } from './artwork'
const fonts = new Map<number, Promise<Font>>()
const loadFont = (weight: 400 | 700) => {
  let pending = fonts.get(weight)
  if (!pending) {
    pending = (async () => {
      const [response, converter] = await Promise.all([fetch(weight === 400 ? regularUrl : boldUrl), import('opentype.js')])
      if (!response.ok) throw new Error('Unable to load the bundled font. Try again.')
      return converter.parse(await response.arrayBuffer())
    })()
    fonts.set(weight, pending)
    pending.catch(() => fonts.delete(weight))
  }
  return pending
}
export const outlineText = async (value: TextDefinition) => {
  const drawing = validateText(value)
  const font = await loadFont(drawing.weight)
  for (const character of new Set(drawing.content.replaceAll('\n', ''))) {
    if (!font.charToGlyphIndex(character)) throw new Error(`Unsupported glyph “${character}” in Geist Latin. Choose a supported character.`)
  }
  const options = { kerning: true, letterSpacing: drawing.letterSpacing / drawing.size }
  const lines = drawing.content.split('\n')
  const advances = lines.map(line => font.getAdvanceWidth(line, drawing.size, options))
  const lineWidth = Math.max(...advances)
  const paths = lines.map((line, index) => {
    const x = drawing.align === 'center' ? (lineWidth - advances[index]!) / 2 : drawing.align === 'right' ? lineWidth - advances[index]! : 0
    return font.getPath(line, x, index * drawing.size * drawing.lineHeight, drawing.size, options)
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
