type Family = { family: string; category: string; version: string; variants: { variant: string; id: string; url: string }[] }
type FontRequest = { url: string; method: string; headers: Pick<Headers, 'get'>; body?: unknown }
type Options = { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number }
const CATALOG_LIMIT = 10_000_000, FONT_LIMIT = 4_000_000, CACHE_LIMIT = 8_000_000
const CATALOG_TTL = 60 * 60 * 1000, FONT_TTL = 24 * CATALOG_TTL
const variantPattern = /^(regular|italic|[1-9]00(?:italic)?)$/
class FontError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status } }
const fail = (status: number, message: string): never => { throw new FontError(status, message) }
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
const fontUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 2000) return
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== 'fonts.gstatic.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/s\/[A-Za-z0-9_/-]+\.ttf$/.test(url.pathname)) return
    url.protocol = 'https:'
    return url.href
  } catch { return }
}
const boundedBody = async (response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> => {
  const length = response.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) { await response.body?.cancel(); return fail(502, 'Font service returned an oversized response.') }
  if (!response.body) return fail(502, 'Font service returned an empty response.')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  const interrupted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new FontError(504, 'Font service timed out. Try again.')), { once: true })
  })
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await Promise.race([reader.read(), interrupted])
      if (done) break
      size += value.byteLength
      if (size > limit) return fail(502, 'Font service returned an oversized response.')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  if (!size || (length !== null && Number(length) !== size)) return fail(502, 'Font service returned an incomplete response.')
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}
const normalizeCatalogue = async (data: unknown): Promise<Family[]> => {
  if (!data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items) || data.items.length > 5000) return fail(502, 'Font catalogue is unavailable. Try again later.')
  const result: Family[] = [], names = new Set<string>()
  for (const item of data.items) {
    if (!item || typeof item.family !== 'string' || item.family.length > 200 || !item.family.trim() || names.has(item.family) || !['serif', 'sans-serif', 'monospace', 'display', 'handwriting'].includes(item.category) || typeof item.version !== 'string' || !/^v\d{1,8}$/.test(item.version) || !Array.isArray(item.subsets) || !item.subsets.includes('latin') || !Array.isArray(item.variants) || !item.files || typeof item.files !== 'object') continue
    const variants: Family['variants'] = []
    for (const variant of new Set(item.variants)) {
      if (typeof variant !== 'string' || !variantPattern.test(variant)) continue
      const url = fontUrl(item.files[variant])
      if (url) variants.push({ variant, id: await hash(url), url })
    }
    if (variants.length) { result.push({ family: item.family, category: item.category, version: item.version, variants }); names.add(item.family) }
  }
  return result
}
const validateTtf = (bytes: Uint8Array) => {
  if (bytes.length < 12 || bytes[0] !== 0 || bytes[1] !== 1 || bytes[2] !== 0 || bytes[3] !== 0) return fail(502, 'Font service did not return a static TrueType font.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = view.getUint16(4)
  if (!count || count > 512 || 12 + 16 * count > bytes.length) return fail(502, 'Font service returned an invalid font.')
  for (let i = 0; i < count; i++) {
    const position = 12 + i * 16
    if (String.fromCharCode(...bytes.subarray(position, position + 4)) === 'fvar' || view.getUint32(position + 8) + view.getUint32(position + 12) > bytes.length) return fail(502, 'Font service did not return a static TrueType font.')
  }
}

// Only fully read, immutable data enters this cache. No pending request promises or streams cross Worker requests.
export const createGoogleFontsHandler = ({ fetcher = fetch, now = Date.now, timeoutMs = 10_000 }: Options = {}) => {
  let catalogue: { key: string; expires: number; families: Family[] } | undefined
  const fonts = new Map<string, { bytes: Uint8Array<ArrayBuffer>; expires: number }>()
  let cacheBytes = 0
  const upstream = async (url: string, limit: number, types: string[]) => {
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout>
    const expired = new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new FontError(504, 'Font service timed out. Try again.')) }, timeoutMs) })
    try {
      return await Promise.race([(async () => {
        const response = await fetcher(url, { redirect: 'manual', credentials: 'omit', signal: controller.signal, headers: { Accept: types[0]! } })
        if (!response.ok || response.redirected || !types.includes((response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase())) { await response.body?.cancel(); return fail(502, 'Font service is unavailable. Try again later.') }
        return boundedBody(response, limit, controller.signal)
      })(), expired])
    } finally { clearTimeout(timeout!) }
  }
  const getCatalogue = async (key: string) => {
    if (catalogue?.key === key && catalogue.expires > now()) return catalogue.families
    const url = new URL('https://www.googleapis.com/webfonts/v1/webfonts')
    url.searchParams.set('key', key); url.searchParams.set('sort', 'popularity'); url.searchParams.set('subset', 'latin')
    const bytes = await upstream(url.href, CATALOG_LIMIT, ['application/json'])
    const families = await normalizeCatalogue(JSON.parse(new TextDecoder().decode(bytes)))
    catalogue = { key, expires: now() + CATALOG_TTL, families }
    return families
  }
  return async (request: FontRequest, apiKey?: string): Promise<Response> => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    try {
      const url = new URL(request.url), path = url.pathname.replace(/\/$/, '')
      if (!['/api/fonts/catalog', '/api/fonts/file'].includes(path)) return fail(404, 'Font endpoint not found.')
      if (request.method !== 'GET') return fail(405, 'Use GET to request fonts.')
      if (request.body || request.headers.get('transfer-encoding') || (request.headers.get('content-length') !== null && request.headers.get('content-length') !== '0')) return fail(400, 'Font requests cannot include a body.')
      const origin = request.headers.get('origin'), site = request.headers.get('sec-fetch-site')
      if ((origin && origin !== url.origin) || (site && !['same-origin', 'none'].includes(site))) return fail(403, 'Request fonts from the Overprint editor.')
      const allowed = path.endsWith('/catalog') ? ['q', 'offset'] : ['family', 'variant', 'version', 'id']
      if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) return fail(400, 'Invalid font request.')
      const q = url.searchParams.get('q') ?? '', offsetText = url.searchParams.get('offset') ?? '0'
      if (path.endsWith('/catalog') && (q.length > 100 || /[\u0000-\u001f]/.test(q) || !/^\d{1,5}$/.test(offsetText))) return fail(400, 'Invalid catalogue search.')
      const family = url.searchParams.get('family') ?? '', variant = url.searchParams.get('variant') ?? '', version = url.searchParams.get('version') ?? '', id = url.searchParams.get('id') ?? ''
      if (path.endsWith('/file') && (!family || family.length > 200 || !variantPattern.test(variant) || !/^v\d{1,8}$/.test(version) || !/^[a-f0-9]{64}$/.test(id))) return fail(400, 'Invalid font selection.')
      if (!apiKey?.trim()) return fail(503, 'Google Fonts is not configured. Use a bundled font or contact the host.')
      const families = await getCatalogue(apiKey)
      if (path.endsWith('/catalog')) {
        const matches = families.filter(item => item.family.toLowerCase().includes(q.trim().toLowerCase())), offset = Number(offsetText)
        return Response.json({ families: matches.slice(offset, offset + 40).map(item => ({ ...item, variants: item.variants.map(({ variant, id }) => ({ variant, id })) })), total: matches.length, offset }, { headers })
      }
      const selected = families.find(item => item.family === family && item.version === version)?.variants.find(item => item.variant === variant && item.id === id)
      if (!selected) return fail(409, 'This font version is unavailable. Choose it again from the catalogue; existing artwork is unchanged.')
      const cached = fonts.get(id)
      let bytes: Uint8Array<ArrayBuffer>
      if (cached && cached.expires > now()) bytes = cached.bytes
      else {
        bytes = await upstream(selected.url, FONT_LIMIT, ['font/ttf', 'application/x-font-ttf', 'application/octet-stream', 'application/font-sfnt'])
        validateTtf(bytes)
        const previous = fonts.get(id)
        if (previous) { cacheBytes -= previous.bytes.byteLength; fonts.delete(id) }
        while (fonts.size >= 8 || cacheBytes + bytes.byteLength > CACHE_LIMIT) { const oldest = fonts.keys().next().value!; cacheBytes -= fonts.get(oldest)!.bytes.byteLength; fonts.delete(oldest) }
        fonts.set(id, { bytes, expires: now() + FONT_TTL }); cacheBytes += bytes.byteLength
      }
      return new Response(bytes.slice(), { headers: { ...headers, 'Content-Type': 'font/ttf', 'Content-Length': String(bytes.byteLength) } })
    } catch (error) {
      const status = error instanceof FontError ? error.status : 502
      return Response.json({ statusCode: status, statusMessage: error instanceof FontError ? error.message : 'Font service is unavailable. Try again later.' }, { status, headers })
    }
  }
}
export const handleGoogleFontsRequest = createGoogleFontsHandler()
