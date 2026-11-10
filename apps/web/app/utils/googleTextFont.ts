import type { Font } from 'opentype.js'
import type { GoogleFontIdentity } from './textDrawing'

const cache = new Map<string, Promise<{ font: Font; identity: GoogleFontIdentity }>>()
const unavailable = 'This font is unavailable. Existing artwork still displays and exports. Retry or choose another Google font to edit.'
export const loadGoogleTextFont = async (identity: GoogleFontIdentity) => {
  const key = JSON.stringify([identity.family, identity.variant, identity.version, identity.id])
  let pending = cache.get(key)
  if (!pending) {
    pending = (async () => {
      const query = new URLSearchParams({ family: identity.family, variant: identity.variant, version: identity.version, id: identity.id })
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const response = await fetch(`/api/fonts/file?${query}`, { signal: controller.signal })
        if (!response.ok || !response.body) throw new Error(unavailable)
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.length
          if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new Error(unavailable) }
          chunks.push(value)
        }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
        const { parse } = await import('opentype.js')
        const font = parse(bytes.buffer)
        // OpenType 2 groups names by platform; older parsers expose them directly.
        const names = font.names as unknown as Record<string, Record<string, unknown>>
        const licenses = [names.license, names.windows?.license, names.unicode?.license, names.macintosh?.license, names.licenseURL, names.windows?.licenseURL, names.unicode?.licenseURL, names.macintosh?.licenseURL]
        const license = licenses.flatMap(value => value && typeof value === 'object' ? Object.values(value) : []).find(value => typeof value === 'string')
        return { font, identity: { ...identity, sha256, license: typeof license === 'string' ? license.slice(0, 4096) : 'Licence metadata unavailable in font file.' } }
      } catch { throw new Error(unavailable) }
      finally { clearTimeout(timeout) }
    })()
    cache.set(key, pending)
    if (cache.size > 8) cache.delete(cache.keys().next().value!)
    pending.catch(() => { if (cache.get(key) === pending) cache.delete(key) })
  }
  const result = await pending
  if (identity.sha256 && identity.sha256 !== result.identity.sha256) throw new Error('Font bytes have changed. Existing outlines are preserved. Choose the font again to update deliberately.')
  return result
}
