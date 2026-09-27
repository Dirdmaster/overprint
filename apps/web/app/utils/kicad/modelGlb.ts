import { MAX_MODEL_BYTES, encodeGlb } from '../boardModels.ts'
export type ModelMesh = { positions: number[]; indices: number[]; color?: number[] }
export type ModelInstance = { meshes: ModelMesh[]; matrix: number[] }

/** Pack only solid, indexed meshes into the existing bounded project GLB format. */
export const componentGlb = (instances: ModelInstance[]) => {
  const chunks: Uint8Array[] = [], bufferViews: object[] = [], accessors: object[] = [], meshes: object[] = [], nodes: object[] = [], materials: object[] = []
  const reused = new Map<ModelMesh[], number[]>()
  let length = 0, expanded = 0
  const attribute = (values: number[], indices: boolean) => {
    const data = indices ? new Uint32Array(values) : new Float32Array(values)
    const view = bufferViews.length
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.byteLength })
    length += data.byteLength
    if (length > MAX_MODEL_BYTES) throw new Error('Component models exceed the 8 MB limit.')
    chunks.push(new Uint8Array(data.buffer))
    const bounds = !indices ? [0, 1, 2].map(axis => {
      let min = Infinity, max = -Infinity
      for (let i = axis; i < values.length; i += 3) { min = Math.min(min, values[i]!); max = Math.max(max, values[i]!) }
      return [min, max]
    }) : undefined
    accessors.push({ bufferView: view, componentType: indices ? 5125 : 5126, count: values.length / (indices ? 1 : 3), type: indices ? 'SCALAR' : 'VEC3', ...(bounds ? { min: bounds.map(b => b[0]), max: bounds.map(b => b[1]) } : {}) })
    return accessors.length - 1
  }
  for (const instance of instances) {
    let ids = reused.get(instance.meshes)
    for (const mesh of instance.meshes) expanded += mesh.positions.length * 8 + mesh.indices.length * 4
    if (expanded > 32 * 1024 * 1024) throw new Error('Component models exceed the 32 MB rendered geometry limit.')
    if (!ids) {
      ids = instance.meshes.map(mesh => {
        if (mesh.positions.length < 9 || mesh.positions.length % 3 || mesh.indices.length < 3 || mesh.indices.length % 3 || mesh.positions.some(n => !Number.isFinite(n) || Math.abs(n) > 100000) || mesh.indices.some(n => !Number.isInteger(n) || n < 0 || n >= mesh.positions.length / 3)) throw new Error('Invalid component mesh.')
        const color = mesh.color ?? [0.55, 0.55, 0.55]
        if (color.length !== 3 || color.some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error('Invalid component color.')
        materials.push({ pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: 0.7 }, doubleSided: true })
        meshes.push({ primitives: [{ attributes: { POSITION: attribute(mesh.positions, false) }, indices: attribute(mesh.indices, true), material: materials.length - 1 }] })
        return meshes.length - 1
      })
      reused.set(instance.meshes, ids)
    }
    for (const mesh of ids) nodes.push({ mesh, matrix: instance.matrix })
    if (nodes.length > 10000) throw new Error('Too many component meshes.')
  }
  const document = { asset: { version: '2.0', generator: 'Overprint embedded models' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, buffers: [{ byteLength: length }], bufferViews, accessors }
  const json = new TextEncoder().encode(JSON.stringify(document)), jsonLength = Math.ceil(json.length / 4) * 4
  const output = new Uint8Array(28 + jsonLength + length), header = new DataView(output.buffer)
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, output.length, true)
  header.setUint32(12, jsonLength, true); header.setUint32(16, 0x4e4f534a, true)
  output.fill(32, 20, 20 + jsonLength); output.set(json, 20)
  header.setUint32(20 + jsonLength, length, true); header.setUint32(24 + jsonLength, 0x004e4942, true)
  let offset = 28 + jsonLength
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
  return encodeGlb(output)
}
