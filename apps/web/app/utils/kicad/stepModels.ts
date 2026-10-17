import type { ModelMesh } from './modelGlb.ts'
export type StepResult = { success: boolean; meshes?: { color?: number[]; attributes: { position: { array: number[] } }; index: { array: number[] }; brep_faces?: { first: number; last: number; color?: number[] | null }[] }[] }
export type StepReader = (bytes: Uint8Array) => Promise<StepResult>
let converter: Promise<{ ReadStepFile: (bytes: Uint8Array, options: object) => StepResult }> | undefined
export const readStep: StepReader = async bytes => {
  if (!converter) converter = (async () => {
    const url = '/model-converter/occt-import-js.mjs'
    const { default: factory } = await import(/* @vite-ignore */ url)
    return factory({ locateFile: () => '/model-converter/occt-import-js.wasm', print: () => {}, printErr: () => {} })
  })()
  return (await converter).ReadStepFile(bytes, { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: 0.02, angularDeflection: 0.5 })
}
export const stepMeshes = (result: StepResult): ModelMesh[] => {
  if (!result.success || !result.meshes?.length) throw new Error('STEP model could not be converted.')
  const meshes: ModelMesh[] = []
  let size = 0
  for (const mesh of result.meshes) {
    const positions = mesh.attributes.position.array, indices = mesh.index.array
    size += positions.length * 8 + indices.length * 4
    if (size > 16 * 1024 * 1024) throw new Error('STEP mesh exceeds the 16 MB conversion limit.')
    // Per-face colors are common for connectors and IC bodies.
    const faces = mesh.brep_faces
    if (faces?.some(face => face.color)) {
      const groups = new Map<string, { color: number[]; indices: number[] }>()
      for (const face of faces) {
        const color = face.color ?? mesh.color ?? [0.55, 0.55, 0.55], key = color.join(',')
        const group = groups.get(key) ?? { color, indices: [] }; groups.set(key, group)
        if (!Number.isInteger(face.first) || !Number.isInteger(face.last) || face.first < 0 || face.last < face.first || (face.last + 1) * 3 > indices.length) throw new Error('Invalid STEP face range.')
        for (let i = face.first * 3; i < (face.last + 1) * 3; i++) group.indices.push(indices[i]!)
      }
      for (const group of groups.values()) meshes.push({ positions, ...group })
    } else meshes.push({ positions, indices, color: mesh.color })
  }
  return meshes
}
