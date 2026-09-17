import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
import { demoBoard } from './demoBoard.ts'

// Original solid cubes provide unmistakable front/back markers without third-party models.
export const componentGlb = () => {
  const points = [
    -1,-1,1, 1,-1,1, 1,1,1, -1,-1,1, 1,1,1, -1,1,1,
    1,-1,-1, -1,-1,-1, -1,1,-1, 1,-1,-1, -1,1,-1, 1,1,-1,
    -1,-1,-1, -1,-1,1, -1,1,1, -1,-1,-1, -1,1,1, -1,1,-1,
    1,-1,1, 1,-1,-1, 1,1,-1, 1,-1,1, 1,1,-1, 1,1,1,
    -1,1,1, 1,1,1, 1,1,-1, -1,1,1, 1,1,-1, -1,1,-1,
    -1,-1,-1, 1,-1,-1, 1,-1,1, -1,-1,-1, 1,-1,1, -1,-1,1,
  ].map(value => value * .004)
  const binary = Buffer.from(new Float32Array(points).buffer)
  const document = {
    asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 36, type: 'VEC3', min: [-.004,-.004,-.004], max: [.004,.004,.004] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1,0,.3,1], metallicFactor: 0 } }, { pbrMetallicRoughness: { baseColorFactor: [0,.1,1,1], metallicFactor: 0 } }],
    meshes: [0,1].map(material => ({ primitives: [{ attributes: { POSITION: 0 }, material }] })),
    nodes: [{ name: 'FRONT', mesh: 0, translation: [.025,.0056,.045] }, { name: 'BACK', mesh: 1, translation: [.044,-.004,.088] }], scenes: [{ nodes: [0,1] }], scene: 0,
  }
  let json = Buffer.from(JSON.stringify(document))
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)])
  const header = Buffer.alloc(20)
  header.write('glTF'); header.writeUInt32LE(2,4); header.writeUInt32LE(28 + json.length + binary.length,8); header.writeUInt32LE(json.length,12); header.writeUInt32LE(0x4e4f534a,16)
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942,4)
  return Buffer.concat([header,json,binHeader,binary])
}
export const componentBoard = () => {
  const files = unzipSync(demoBoard.buffer)
  const manifest = JSON.parse(strFromU8(files['manifest.json']!))
  manifest.models = { version: 1, status: 'partial', units: 'm', file: 'models/components.glb', coordinates: { x: 'board-x', y: 'toward-front', z: 'board-y', origin: 'board-origin-at-back-surface' }, boardThicknessMm: 1.6, includedReferences: ['FRONT','BACK'], missing: [{ reference: 'H1', reason: 'No visible 3D model is assigned.' }], warnings: [] }
  files['manifest.json'] = strToU8(JSON.stringify(manifest)); files['models/components.glb'] = componentGlb()
  return { name: 'assembled.overprint-board', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) }
}
