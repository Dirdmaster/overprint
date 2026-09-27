import { decompress } from 'fzstd'
import { atom, child, children, type SExpr } from './sexpr.ts'
const LIMIT = 16 * 1024 * 1024

// MurmurHash3 x64/128 with KiCad's seed and legacy tail padding convention.
// The underlying MurmurHash3 algorithm is public domain (Austin Appleby).
const murmur = (bytes: Uint8Array) => {
  const mask = (1n << 64n) - 1n, c1 = 0x87c37b91114253d5n, c2 = 0x4cf5ad432745937fn
  const u = (n: bigint) => n & mask
  const rot = (n: bigint, s: bigint) => u((n << s) | (n >> (64n - s)))
  const mix = (n: bigint) => { n = u((n ^ (n >> 33n)) * 0xff51afd7ed558ccdn); n = u((n ^ (n >> 33n)) * 0xc4ceb9fe1a85ec53n); return n ^ (n >> 33n) }
  const word = (start: number, end: number) => { let n = 0n; for (let i = end - 1; i >= start; i--) n = (n << 8n) | BigInt(bytes[i]!); return n }
  let h1 = 0xabba2345n, h2 = h1, offset = 0
  for (; offset + 16 <= bytes.length; offset += 16) {
    h1 ^= u(rot(u(word(offset, offset + 8) * c1), 31n) * c2)
    h1 = u(u(rot(h1, 27n) + h2) * 5n + 0x52dce729n)
    h2 ^= u(rot(u(word(offset + 8, offset + 16) * c2), 33n) * c1)
    h2 = u(u(rot(h2, 31n) + h1) * 5n + 0x38495ab5n)
  }
  const remaining = bytes.length - offset
  const length = bytes.length + (remaining ? 4 - remaining % 4 : 0)
  // KiCad's legacy hash discards a tail when padding brings it to 16 bytes.
  if (length % 16) {
    if (remaining > 8) h2 ^= u(rot(u(word(offset + 8, bytes.length) * c2), 33n) * c1)
    if (remaining) h1 ^= u(rot(u(word(offset, Math.min(offset + 8, bytes.length)) * c1), 31n) * c2)
  }
  h1 ^= BigInt(length); h2 ^= BigInt(length)
  h1 = u(h1 + h2); h2 = u(h2 + h1); h1 = mix(h1); h2 = mix(h2)
  h1 = u(h1 + h2); h2 = u(h2 + h1)
  return h1.toString(16).padStart(16, '0') + h2.toString(16).padStart(16, '0')
}

/** Decode a single bounded, dictionary-free Zstd frame as emitted by KiCad. */
const decode = (base64: string) => {
  if (base64.length > LIMIT * 2 || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Invalid embedded base64 payload.')
  const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0)), view = new DataView(data.buffer)
  if (data.length < 6 || view.getUint32(0, true) !== 0xfd2fb528) throw new Error('Invalid embedded Zstandard frame.')
  const flags = data[4]!, single = Boolean(flags & 32), sizeFlag = flags >> 6
  if (flags & 27) throw new Error('Unsupported embedded compression header.')
  let offset = single ? 5 : 6
  const sizeBytes = sizeFlag ? 1 << sizeFlag : single ? 1 : 0
  if (!sizeBytes || offset + sizeBytes > data.length) throw new Error('Embedded model has no bounded size.')
  let size = 0
  for (let i = sizeBytes - 1; i >= 0; i--) size = size * 256 + data[offset + i]!
  if (sizeFlag === 1) size += 256
  const descriptor = data[5]!, base = 2 ** (10 + (descriptor >> 3))
  const window = single ? size : base + base / 8 * (descriptor & 7)
  if (size > LIMIT || window > LIMIT) throw new Error('Embedded model exceeds the 16 MB decoded limit.')
  offset += sizeBytes
  let last = false
  while (!last) {
    if (offset + 3 > data.length) throw new Error('Truncated embedded model.')
    const header = data[offset]! + data[offset + 1]! * 256 + data[offset + 2]! * 65536
    last = Boolean(header & 1)
    const kind = (header >> 1) & 3, blockSize = header >> 3
    if (kind === 3 || blockSize > 131072) throw new Error('Invalid embedded block.')
    offset += 3 + (kind === 1 ? 1 : blockSize)
  }
  if (offset + (flags & 4 ? 4 : 0) !== data.length) throw new Error('Invalid embedded frame length.')
  const result = decompress(data, new Uint8Array(size))
  if (result.length !== size) throw new Error('Invalid embedded model size.')
  return result
}

export const embeddedFileReader = (board: SExpr) => {
  const cache = new Map<SExpr, Promise<Uint8Array>>()
  let total = 0
  return async (footprint: SExpr, path: string) => {
    if (!path.startsWith('kicad-embed://')) throw new Error('Model is external. In KiCad, use Tools → Collect and Embed 3D Models, then save again.')
    const name = path.slice('kicad-embed://'.length)
    const find = (scope: SExpr) => children(child(scope, 'embedded_files'), 'file').filter(file => atom(child(file, 'name')) === name)
    const local = find(footprint), matches = local.length ? local : find(board)
    if (matches.length !== 1) throw new Error('Embedded model is missing or ambiguous.')
    const file = matches[0]!
    if (!cache.has(file)) cache.set(file, (async () => {
      const text = child(file, 'data').slice(1).join('')
      if (!text.startsWith('|') || !text.endsWith('|')) throw new Error('Invalid embedded payload delimiter.')
      const bytes = decode(text.slice(1, -1))
      total += bytes.length
      if (total > 32 * 1024 * 1024) throw new Error('Embedded models exceed the 32 MB total decoded limit.')
      const expected = atom(child(file, 'checksum')).toLowerCase()
      const actual = expected.length === 64
        ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), b => b.toString(16).padStart(2, '0')).join('')
        : murmur(bytes)
      if (actual !== expected) throw new Error('Embedded model checksum mismatch.')
      return bytes
    })())
    return cache.get(file)!
  }
}
