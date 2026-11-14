/** WebKit may round an SVG image's sub-unit intrinsic size down to zero.
 * Supply a usable pixel viewport for thin images without changing their viewBox,
 * saved artwork, or physical placement. Ordinary SVGs retain their source.
 */
export const svgImageUrl = (source: string) => {
  const root = source.match(/<svg\b[^>]*>/)?.[0]
  const box = root?.match(/\bviewBox\s*=\s*["']([^"']+)["']/)?.[1]?.trim().split(/[\s,]+/).map(Number)
  if (root && box?.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) {
    const dimension = (name: string) => {
      const value = root.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`))?.[1]
      return value && /^\d*\.?\d+(?:px)?$/.test(value) ? Number(value.replace(/px$/, '')) : undefined
    }
    const explicitWidth = dimension('width'), explicitHeight = dimension('height')
    const width = explicitWidth ?? (explicitHeight === undefined ? box[2]! : explicitHeight * box[2]! / box[3]!)
    const height = explicitHeight ?? (explicitWidth === undefined ? box[3]! : explicitWidth * box[3]! / box[2]!)
    if (width > 0 && height > 0 && (Math.min(width, height) < 1 || Math.min(box[2]!, box[3]!) < 1)) {
      const scale = 10 ** Math.max(0, Math.ceil(Math.log10(16 / Math.min(width, height))))
      if (!Number.isFinite(width * scale) || !Number.isFinite(height * scale)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
      const viewport = root.replace(/\s(?:width|height)\s*=\s*["'][^"']*["']/g, '').replace(/\/?>(\s*)$/, ` width="${width * scale}" height="${height * scale}"${root.endsWith('/>') ? '/>' : '>'}$1`)
      const image = source.slice(source.indexOf(root)).replace(root, viewport)
      // The image decoder also rounds a fractional root viewBox. Keep that
      // viewBox on a nested SVG, inside a larger image viewport.
      source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width * scale} ${height * scale}">${image}</svg>`
    }
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
}

/** Keep SVG <image> viewport dimensions above WebKit's fractional-size threshold.
 * The inverse transform preserves the exact board-space frame and rear mirror.
 */
export const svgImageAttributes = (item: { source: string; x: number; y: number; width: number; height: number }, side?: string) => {
  const minimum = Math.min(item.width, item.height)
  const scale = minimum > 0 && minimum < 1 ? 10 ** Math.ceil(Math.log10(16 / minimum)) : 1
  const mirror = side === 'back' ? `translate(${2 * item.x + item.width} 0) scale(-1 1)` : ''
  const transform = [mirror, scale === 1 ? '' : `scale(${1 / scale})`].filter(Boolean).join(' ')
  return { href: svgImageUrl(item.source), x: item.x * scale, y: item.y * scale, width: item.width * scale, height: item.height * scale, transform: transform || undefined }
}
