import type { Artwork } from './artwork'
export type TextDefinition = {
  type: 'text'; font: 'geist-latin-v1'; weight: 400 | 700; content: string
  size: number; align: 'left' | 'center' | 'right'; letterSpacing: number; lineHeight: number; fill: string
}
export const defaultText = (): TextDefinition => ({ type: 'text', font: 'geist-latin-v1', weight: 400, content: 'Text', size: 3, align: 'left', letterSpacing: 0, lineHeight: 1.2, fill: '#ffffff' })
export const validateText = (value: unknown): TextDefinition => {
  const d = value as TextDefinition
  const number = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
  if (!d || d.type !== 'text' || d.font !== 'geist-latin-v1' || ![400, 700].includes(d.weight) || typeof d.content !== 'string' || !d.content.trim() || d.content.length > 500 || d.content.split('\n').length > 20 || !number(d.size, .1, 100) || !['left', 'center', 'right'].includes(d.align) || !number(d.letterSpacing, 0, 20) || !number(d.lineHeight, 1, 3) || typeof d.fill !== 'string' || !/^#[\da-f]{6}$/i.test(d.fill)) throw new Error('Invalid text. Use 1–500 characters, up to 20 lines, size 0.1–100 mm, spacing 0–20 mm and a hex fill.')
  const content = d.content.normalize('NFC')
  if (/[^\n\u0020-\u024f\u2000-\u206f\u20a0-\u20cf\u2100-\u22ff]/u.test(content)) throw new Error('Unsupported character or script. Bundled fonts support Latin text and selected symbols only.')
  return { type: 'text', font: d.font, weight: d.weight, content, size: d.size, align: d.align, letterSpacing: d.letterSpacing, lineHeight: d.lineHeight, fill: d.fill }
}
export const physicalText = (item: Artwork): TextDefinition => {
  const d = validateText(item.drawing)
  const root = new DOMParser().parseFromString(item.source, 'image/svg+xml').documentElement
  const width = Number(root.getAttribute('viewBox')?.trim().split(/[\s,]+/)[2])
  if (!Number.isFinite(width) || width <= 0) throw new Error('Invalid frozen text bounds.')
  const scale = item.width / width
  return { ...d, size: d.size * scale, letterSpacing: d.letterSpacing * scale }
}
