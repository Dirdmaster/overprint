import { Matrix4 } from 'three'
import { wrlMeshes } from './wrlModels.ts'
import { atom, child, children, flag, number, type SExpr } from './sexpr.ts'
import { embeddedFileReader } from './embeddedFiles.ts'
import { componentGlb, type ModelInstance, type ModelMesh } from './modelGlb.ts'
import { readStep, stepMeshes, type StepReader } from './stepModels.ts'
import { validateBoardModels, type BoardModels } from '../boardModels.ts'
const radians = (angle: number) => angle * Math.PI / 180
const xyz = (node: SExpr, name: string, fallback: number) => {
  const value = child(child(node, name), 'xyz')
  return [1, 2, 3].map(i => number(value, i, fallback)) as [number, number, number]
}
const placement = (footprint: SExpr, model: SExpr, thickness: number, surfaceOffset: number) => {
  const at = child(footprint, 'at'), angle = radians(number(at, 3, 0)), back = atom(child(footprint, 'layer')) === 'B.Cu'
  const [x, y, z] = xyz(model, 'offset', 0), [rx, ry, rz] = xyz(model, 'rotate', 0), scale = xyz(model, 'scale', 1)
  if (scale.some(v => v === 0)) throw new Error('Model scale must be nonzero.')
  // Work in KiCad's model coordinates (X right, Y up, Z toward front), then
  // map to the existing GLB convention (X board X, Y height, Z board Y), metres.
  const matrix = new Matrix4().set(0.001, 0, 0, 0, 0, 0, 0.001, 0, 0, -0.001, 0, 0, 0, 0, 0, 1)
  matrix.multiply(new Matrix4().makeTranslation(number(at), -number(at, 2), back ? 0 : thickness))
  matrix.multiply(new Matrix4().makeRotationZ(angle))
  if (back) matrix.multiply(new Matrix4().makeRotationX(Math.PI))
  matrix.multiply(new Matrix4().makeTranslation(x, y, z + surfaceOffset))
  matrix.multiply(new Matrix4().makeRotationZ(-radians(rz)))
  matrix.multiply(new Matrix4().makeRotationY(-radians(ry)))
  matrix.multiply(new Matrix4().makeRotationX(-radians(rx)))
  matrix.multiply(new Matrix4().makeScale(...scale))
  return matrix.toArray()
}
export const importEmbeddedModels = async (board: SExpr, reader: StepReader = readStep): Promise<BoardModels | undefined> => {
  const footprints = children(board, 'footprint')
  if (!footprints.some(fp => children(fp, 'model').length)) return undefined
  const stackup = child(child(board, 'setup'), 'stackup')
  const layerThickness = (name: string, fallback: number) => number(child(children(stackup, 'layer').find(layer => atom(layer) === name) ?? [], 'thickness'), 1, fallback)
  const bodyThickness = number(child(child(board, 'general'), 'thickness'), 1, 1.6) - layerThickness('F.Cu', 0.035) - layerThickness('B.Cu', 0.035) - layerThickness('F.Mask', 0.01) - layerThickness('B.Mask', 0.01)
  const result: BoardModels = { version: 1, status: 'empty', units: 'm', coordinates: { x: 'board-x', y: 'toward-front', z: 'board-y', origin: 'board-origin-at-back-surface' }, boardThicknessMm: bodyThickness, includedReferences: [], missing: [], warnings: [] }
  const read = embeddedFileReader(board), cache = new Map<Uint8Array, ModelMesh[]>(), instances: ModelInstance[] = []
  let count = 0, renderedBytes = 0, storedBytes = 0
  const stored = new Set<ModelMesh[]>()
  for (const fp of footprints) {
    const reference = children(fp, 'property').find(p => atom(p) === 'Reference')
    const ref = (reference ? atom(reference, 2) : 'Unnamed component').slice(0, 500)
    for (const model of children(fp, 'model')) {
      if (flag(model, 'hide')) continue
      if (++count > 1000) { result.warnings.push('Only the first 1000 visible model instances are processed.'); break }
      try {
        const path = atom(model), bytes = await read(fp, path)
        if (!/\.(step|stp|wrl)$/i.test(path)) throw new Error('Unsupported embedded model format. STEP, STP and static WRL are supported.')
        let meshes = cache.get(bytes)
        if (!meshes) {
          meshes = /\.wrl$/i.test(path) ? wrlMeshes(bytes) : stepMeshes(await reader(bytes))
          componentGlb([{ meshes, matrix: new Matrix4().toArray() }])
          cache.set(bytes, meshes)
        }
        const bytesNeeded = meshes.reduce((sum, mesh) => sum + mesh.positions.length * 8 + mesh.indices.length * 4, 0)
        const storedNeeded = stored.has(meshes) ? 0 : meshes.reduce((sum, mesh) => sum + (mesh.positions.length + mesh.indices.length) * 4, 0)
        if (renderedBytes + bytesNeeded > 32 * 1024 * 1024 || storedBytes + storedNeeded > 7 * 1024 * 1024) throw new Error('Model omitted to keep the assembled preview within its size limits.')
        instances.push({ meshes, matrix: placement(fp, model, result.boardThicknessMm, 0.05 + layerThickness(atom(child(fp, 'layer')), 0.035)) })
        renderedBytes += bytesNeeded; storedBytes += storedNeeded; stored.add(meshes)
        if (!result.includedReferences.includes(ref)) result.includedReferences.push(ref)
      } catch (error) {
        result.missing.push({ reference: ref, reason: (error instanceof Error ? error.message : 'Unable to read embedded model.').slice(0, 500) })
      }
    }
    if (count > 1000) break
  }
  if (instances.length) {
    try { result.glb = componentGlb(instances); result.encoding = 'gzip-base64'; result.status = result.missing.length || result.warnings.length ? 'partial' : 'ready' }
    catch (error) {
      result.warnings.push(error instanceof Error ? error.message : 'Unable to assemble component models.')
      result.includedReferences = []; result.status = 'unavailable'
    }
  } else result.status = result.missing.length ? 'unavailable' : 'empty'
  return validateBoardModels(result)
}
