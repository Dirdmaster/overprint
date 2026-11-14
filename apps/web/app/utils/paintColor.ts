export const normalizeHex = (value: string) => {
  const hex = value.trim().replace(/^#/, '')
  if (/^[a-f\d]{3}$/i.test(hex)) return `#${[...hex].map(char => char + char).join('').toLowerCase()}`
  return /^[a-f\d]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : undefined
}
export const hsvToHex = (h: number, s: number, v: number) => {
  const channel = (offset: number) => {
    const k = (offset + h / 60) % 6
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, '0')
  }
  return `#${channel(5)}${channel(3)}${channel(1)}`
}
export const hexToHsv = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
  const hue = !delta ? 0 : max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return { h: hue * 60, s: max ? delta / max : 0, v: max }
}

// Sampling reads solid SVG ink definitions, never composited screen pixels.
export const solidPaintColor = (value: string) => {
  const hex = normalizeHex(value)
  if (hex) return hex
  if (!/^rgba?\(/i.test(value) || value.includes('%')) return
  const channels = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number)
  if (!channels || ![3, 4].includes(channels.length) || channels.slice(0, 3).some(n => !Number.isFinite(n) || n < 0 || n > 255) || (channels.length === 4 && channels[3] !== 1)) return
  return '#' + channels.slice(0, 3).map(n => Math.round(n).toString(16).padStart(2, '0')).join('')
}
