import { gzipSync, Gunzip } from 'fflate'
export const MAX_MODEL_BYTES = 8 * 1024 * 1024
const MAX_EXPANDED_GEOMETRY_BYTES = 32 * 1024 * 1024
export type BoardModels = {
  version: 1
  status: 'ready' | 'partial' | 'unavailable' | 'empty'
  units: 'm'
  coordinates: { x: 'board-x'; y: 'toward-front'; z: 'board-y'; origin: 'board-origin-at-back-surface' }
  boardThicknessMm: number
  includedReferences: string[]
  missing: { reference: string; reason: string }[]
  warnings: string[]
  glb?: string
  encoding?: 'gzip-base64'
}
const invalid = (): never => { throw new Error('Invalid component models. Re-export the board with the current KiCad plugin.') }
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max

// This boundary runs before GLTFLoader: only bounded, self-contained solid models
// are accepted. KiCad's component GLB needs no external assets or extensions.
export const validateGlb = (bytes: Uint8Array) => {
  if (bytes.byteLength > MAX_MODEL_BYTES) throw new Error('Component models exceed the 8 MB limit.')
  if (bytes.byteLength < 28) return invalid()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) return invalid()
  const jsonLength = view.getUint32(12, true)
  const binaryHeader = 20 + jsonLength
  if (jsonLength % 4 || binaryHeader + 8 > bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) return invalid()
  const binaryLength = view.getUint32(binaryHeader, true)
  if (binaryLength % 4 || view.getUint32(binaryHeader + 4, true) !== 0x004e4942 || binaryHeader + 8 + binaryLength !== bytes.byteLength) return invalid()
  let gltf: Record<string, any>
  try { gltf = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, binaryHeader))) } catch { return invalid() }
  if (!object(gltf) || gltf.asset?.version !== '2.0') return invalid()
  const inspect = (value: unknown, depth = 0): void => {
    if (depth > 32) return invalid()
    if (typeof value === 'number' && !Number.isFinite(value)) return invalid()
    if (Array.isArray(value)) { for (const child of value) inspect(child, depth + 1) }
    else if (object(value)) {
      if ('uri' in value || ('extensions' in value && Object.keys(value.extensions ?? {}).length)) return invalid()
      for (const child of Object.values(value)) inspect(child, depth + 1)
    }
  }
  inspect(gltf)
  for (const name of ['images', 'textures', 'animations', 'skins', 'extensionsRequired', 'extensionsUsed']) if (gltf[name]?.length) return invalid()
  if (!Array.isArray(gltf.buffers) || gltf.buffers.length !== 1 || !integer(gltf.buffers[0]?.byteLength, binaryLength)) return invalid()
  if (!Array.isArray(gltf.bufferViews) || gltf.bufferViews.length > 60000 || !Array.isArray(gltf.accessors) || gltf.accessors.length > 60000) return invalid()
  for (const buffer of gltf.bufferViews) {
    if (!object(buffer) || buffer.buffer !== 0 || !integer(buffer.byteOffset ?? 0, binaryLength) || !integer(buffer.byteLength, binaryLength) || (buffer.byteOffset ?? 0) + buffer.byteLength > binaryLength) return invalid()
  }
  let totalVertices = 0
  for (const accessor of gltf.accessors) {
    if (!object(accessor) || accessor.sparse || !integer(accessor.bufferView, gltf.bufferViews.length - 1) || !integer(accessor.count, 2_000_000) || !integer(accessor.byteOffset ?? 0, binaryLength)) return invalid()
    const width = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[accessor.type]
    const bytesPerValue = ({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>)[accessor.componentType]
    if (!width || !bytesPerValue) return invalid()
    const buffer = gltf.bufferViews[accessor.bufferView]
    const stride = buffer.byteStride ?? width * bytesPerValue
    // Interleaved attributes clone their entire backing view in Three. KiCad's
    // packed attributes need no interleaving, so reject that amplification path.
    if (!integer(stride, 252) || stride !== width * bytesPerValue || (accessor.byteOffset ?? 0) + Math.max(0, accessor.count - 1) * stride + (accessor.count ? width * bytesPerValue : 0) > buffer.byteLength) return invalid()
    totalVertices += accessor.count
    if (totalVertices > 12_000_000) return invalid()
  }
  if (!Array.isArray(gltf.meshes) || !gltf.meshes.length || gltf.meshes.length > 10000 || !Array.isArray(gltf.nodes) || gltf.nodes.length > 10000 || !Array.isArray(gltf.scenes) || gltf.scenes.length !== 1 || (gltf.scene !== undefined && gltf.scene !== 0)) return invalid()
  let primitives = 0
  const meshVertices: number[] = []
  const meshBytes: number[] = []
  for (const mesh of gltf.meshes) {
    let vertices = 0
    let geometryBytes = 0
    if (!Array.isArray(mesh.primitives)) return invalid()
    primitives += mesh.primitives.length
    if (primitives > 30000) return invalid()
    for (const primitive of mesh.primitives) {
      if (!object(primitive.attributes) || !integer(primitive.attributes.POSITION, gltf.accessors.length - 1) || primitive.targets || (primitive.mode ?? 4) !== 4) return invalid()
      const position = gltf.accessors[primitive.attributes.POSITION]
      if (position.count < 3 || position.type !== 'VEC3' || position.componentType !== 5126 || position.normalized) return invalid()
      vertices += position.count
      // Even absent normals are generated by the viewer, so reserve their bytes.
      geometryBytes += position.count * 3 * 4 * 2
      for (const [semantic, index] of Object.entries(primitive.attributes)) {
        if (!['POSITION', 'NORMAL'].includes(semantic) || !integer(index, gltf.accessors.length - 1)) return invalid()
        const attribute = gltf.accessors[index]
        if (attribute.type !== 'VEC3' || attribute.componentType !== 5126 || attribute.count !== position.count || attribute.normalized) return invalid()
      }
      if (primitive.indices !== undefined) {
        if (!integer(primitive.indices, gltf.accessors.length - 1)) return invalid()
        const indices = gltf.accessors[primitive.indices]
        const indexBytes = ({ 5121: 1, 5123: 2, 5125: 4 } as Record<number, number>)[indices.componentType]
        if (indices.count < 3 || indices.count % 3 || indices.type !== 'SCALAR' || !indexBytes || indices.normalized) return invalid()
        geometryBytes += indices.count * indexBytes
      } else if (position.count % 3) return invalid()
    }
    meshVertices.push(vertices)
    meshBytes.push(geometryBytes)
  }
  const parents = new Set<number>()
  let expandedVertices = 0
  let expandedBytes = 0
  let expandedPrimitives = 0
  const visited = new Set<number>()
  const visiting = new Set<number>()
  const walk = (index: number, depth = 0) => {
    if (!integer(index, gltf.nodes.length - 1) || depth > 64 || visiting.has(index)) return invalid()
    if (visited.has(index)) return
    const node = gltf.nodes[index]
    if (!object(node) || (node.mesh !== undefined && !integer(node.mesh, gltf.meshes.length - 1))) return invalid()
    for (const [field, length] of [['matrix', 16], ['translation', 3], ['rotation', 4], ['scale', 3]] as const) {
      if (node[field] !== undefined && (!Array.isArray(node[field]) || node[field].length !== length || !node[field].every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000))) return invalid()
    }
    if (node.mesh !== undefined) {
      expandedVertices += meshVertices[node.mesh]!
      expandedBytes += meshBytes[node.mesh]!
      expandedPrimitives += gltf.meshes[node.mesh].primitives.length
      if (expandedVertices > 2_000_000 || expandedBytes > MAX_EXPANDED_GEOMETRY_BYTES || expandedPrimitives > 30000) return invalid()
    }
    if (node.children !== undefined && !Array.isArray(node.children)) return invalid()
    visiting.add(index)
    for (const child of node.children ?? []) {
      if (parents.has(child)) return invalid()
      parents.add(child); walk(child, depth + 1)
    }
    visiting.delete(index); visited.add(index)
  }
  for (let index = 0; index < gltf.nodes.length; index++) walk(index)
  for (const scene of gltf.scenes) {
    if (!Array.isArray(scene.nodes) || !scene.nodes.every((n: unknown) => integer(n, gltf.nodes.length - 1))) return invalid()
    if (new Set(scene.nodes).size !== scene.nodes.length || scene.nodes.some((index: number) => parents.has(index))) return invalid()
  }
  return bytes
}
export const encodeGlb = (bytes: Uint8Array) => {
  bytes = gzipSync(validateGlb(bytes), { level: 6, mtime: 0 })
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}
export const decodeGlb = (base64: string, encoding?: 'gzip-base64') => {
  if (base64.length > Math.ceil((MAX_MODEL_BYTES + 65536) / 3) * 4 || base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return invalid()
  let bytes: Uint8Array
  try { bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0)) } catch { return invalid() }
  if (encoding) {
    // Our encoder uses a single member and the basic 10-byte gzip header. Reject
    // optional header fields, which could otherwise accumulate/scan large input.
    if (bytes.length < 18 || bytes[0] !== 31 || bytes[1] !== 139 || bytes[2] !== 8 || bytes[3] !== 0) return invalid()
    const output = new Uint8Array(MAX_MODEL_BYTES)
    let length = 0
    const decoder = new Gunzip(chunk => {
      length += chunk.length
      if (length > MAX_MODEL_BYTES) throw new Error('Component models exceed the 8 MB limit.')
      output.set(chunk, length - chunk.length)
    })
    decoder.onmember = () => invalid()
    try {
      // DEFLATE's bounded expansion per compressed byte makes these small pushes
      // bounded work. Abort as soon as output crosses 8 MB, without decoding the
      // rest of a bomb or trusting its advertised gzip size.
      for (let offset = 0; offset < bytes.length; offset += 1024) decoder.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('8 MB limit')) throw cause
      return invalid()
    }
    bytes = output.subarray(0, length)
  }
  return validateGlb(bytes)
}
export const validateBoardModels = (value: unknown): BoardModels => {
  if (!object(value) || value.version !== 1 || !['ready', 'partial', 'unavailable', 'empty'].includes(value.status) || value.units !== 'm' || value.coordinates?.x !== 'board-x' || value.coordinates?.y !== 'toward-front' || value.coordinates?.z !== 'board-y' || value.coordinates?.origin !== 'board-origin-at-back-surface') return invalid()
  if (typeof value.boardThicknessMm !== 'number' || !Number.isFinite(value.boardThicknessMm) || value.boardThicknessMm <= 0 || value.boardThicknessMm > 20) return invalid()
  const text = (v: unknown) => typeof v === 'string' && v.length <= 500
  if (!Array.isArray(value.includedReferences) || value.includedReferences.length > 10000 || !value.includedReferences.every(text) || !Array.isArray(value.missing) || value.missing.length > 10000 || !value.missing.every((m: unknown) => object(m) && text(m.reference) && text(m.reason)) || !Array.isArray(value.warnings) || value.warnings.length > 100 || !value.warnings.every(text)) return invalid()
  if (value.status === 'ready' || value.status === 'partial') {
    if (typeof value.glb !== 'string') return invalid()
    if (value.encoding !== undefined && value.encoding !== 'gzip-base64') return invalid()
    decodeGlb(value.glb, value.encoding)
  } else if (value.glb !== undefined) return invalid()
  return { version: 1, status: value.status, units: 'm', coordinates: value.coordinates, boardThicknessMm: value.boardThicknessMm, includedReferences: value.includedReferences, missing: value.missing, warnings: value.warnings, ...(value.glb ? { glb: value.glb, ...(value.encoding ? { encoding: value.encoding } : {}) } : {}) }
}
