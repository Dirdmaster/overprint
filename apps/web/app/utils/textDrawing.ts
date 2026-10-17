import type { Artwork } from './artwork'
export type GoogleFontIdentity = { family: string; variant: string; version: string; id: string; sha256?: string; license?: string }
export type TextDefinition = {
  type: 'text'; font: 'geist-latin-v1' | 'google-fonts-v1'; weight: number; google?: GoogleFontIdentity; content: string
  size: number; align: 'left' | 'center' | 'right'; letterSpacing: number; lineHeight: number; fill: string
}
export const defaultText = (): TextDefinition => ({ type: 'text', font: 'geist-latin-v1', weight: 400, content: 'Text', size: 3, align: 'left', letterSpacing: 0, lineHeight: 1.2, fill: '#ffffff' })
export const validateText = (value: unknown): TextDefinition => {
  const d = value as TextDefinition
  const number = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
  if (!d || d.type !== 'text' || !['geist-latin-v1', 'google-fonts-v1'].includes(d.font) || (d.font === 'geist-latin-v1' ? ![400, 700].includes(d.weight) : !Number.isInteger(d.weight) || d.weight < 100 || d.weight > 900) || typeof d.content !== 'string' || !d.content.trim() || d.content.length > 500 || d.content.split('\n').length > 20 || !number(d.size, .1, 100) || !['left', 'center', 'right'].includes(d.align) || !number(d.letterSpacing, 0, 20) || !number(d.lineHeight, 1, 3) || typeof d.fill !== 'string' || !/^#[\da-f]{6}$/i.test(d.fill)) throw new Error('Invalid text. Use 1–500 characters, up to 20 lines, size 0.1–100 mm, spacing 0–20 mm and a hex fill.')
  let google: GoogleFontIdentity | undefined
  if (d.font === 'google-fonts-v1') {
    const g = d.google
    if (!g || typeof g.family !== 'string' || !g.family.trim() || g.family.length > 200 || typeof g.version !== 'string' || !/^v\d{1,8}$/.test(g.version) || typeof g.variant !== 'string' || !/^(regular|italic|[1-9]00(?:italic)?)$/.test(g.variant) || typeof g.id !== 'string' || !/^[a-f0-9]{64}$/.test(g.id) || (g.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(g.sha256)) || (g.license !== undefined && (typeof g.license !== 'string' || g.license.length > 4096))) throw new Error('Invalid Google font identity.')
    const weight = g.variant === 'regular' || g.variant === 'italic' ? 400 : parseInt(g.variant)
    if (d.weight !== weight) throw new Error('Font weight does not match its variant.')
    google = { family: g.family, variant: g.variant, version: g.version, id: g.id, ...(g.sha256 ? { sha256: g.sha256 } : {}), ...(g.license ? { license: g.license } : {}) }
  }
  const content = d.content.normalize('NFC')
  if (/[^\n\u0020-\u024f\u2000-\u206f\u20a0-\u20cf\u2100-\u22ff]/u.test(content)) throw new Error('Unsupported character or script. Text outlining supports Latin text and selected symbols only.')
  return { type: 'text', font: d.font, weight: d.weight, ...(google ? { google } : {}), content, size: d.size, align: d.align, letterSpacing: d.letterSpacing, lineHeight: d.lineHeight, fill: d.fill }
}
export const physicalText = (item: Artwork): TextDefinition => {
  const d = validateText(item.drawing)
  const root = new DOMParser().parseFromString(item.source, 'image/svg+xml').documentElement
  const width = Number(root.getAttribute('viewBox')?.trim().split(/[\s,]+/)[2])
  if (!Number.isFinite(width) || width <= 0) throw new Error('Invalid frozen text bounds.')
  const scale = item.width / width
  return { ...d, size: d.size * scale, letterSpacing: d.letterSpacing * scale }
}
