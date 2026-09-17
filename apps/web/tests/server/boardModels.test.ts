import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'fflate'
import { decodeGlb } from '../../app/utils/boardModels.ts'
import { componentGlb } from '../fixtures/componentBoard.ts'

test('component data survives compressed and uncompressed decoding', () => {
  const source = componentGlb()
  assert.deepEqual(Buffer.from(decodeGlb(source.toString('base64'))), source)
  assert.deepEqual(Buffer.from(decodeGlb(Buffer.from(gzipSync(source)).toString('base64'), 'gzip-base64')), source)
})

test('a forged gzip size cannot bypass the decompression bound', () => {
  const bomb = Buffer.from(gzipSync(new Uint8Array(64 * 1024 * 1024)))
  bomb.writeUInt32LE(0xffffffff, bomb.length - 4)
  assert.throws(() => decodeGlb(bomb.toString('base64'), 'gzip-base64'), /8 MB limit/)
})

test('component validation bounds cloned attributes, index buffers and interleaved views', () => {
  const source = componentGlb()
  const jsonLength = source.readUInt32LE(12)
  const document = JSON.parse(source.subarray(20,20 + jsonLength).toString())
  const originalBinary = source.subarray(28 + jsonLength)
  const pack = (gltf: any, binary: Buffer) => {
    let json = Buffer.from(JSON.stringify(gltf)); json = Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)])
    const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2,4); header.writeUInt32LE(28+json.length+binary.length,8); header.writeUInt32LE(json.length,12); header.writeUInt32LE(0x4e4f534a,16)
    const bin = Buffer.alloc(8); bin.writeUInt32LE(binary.length); bin.writeUInt32LE(0x004e4942,4)
    return Buffer.concat([header,json,bin,binary]).toString('base64')
  }
  const custom = structuredClone(document)
  for (let index = 0; index < 1000; index++) custom.meshes[0].primitives[0].attributes[`_EXTRA_${index}`] = 0
  custom.nodes = Array.from({length:10000},()=>({mesh:0})); custom.scenes[0].nodes = custom.nodes.map((_: unknown,index: number)=>index)
  const indices = structuredClone(document)
  const binary = Buffer.concat([originalBinary,Buffer.alloc(18000*4)])
  indices.buffers[0].byteLength = binary.length
  indices.bufferViews.push({buffer:0,byteOffset:originalBinary.length,byteLength:18000*4})
  indices.accessors.push({bufferView:1,componentType:5125,count:18000,type:'SCALAR'})
  indices.meshes[0].primitives[0].indices = 1
  indices.nodes = Array.from({length:1000},()=>({mesh:0})); indices.scenes[0].nodes = indices.nodes.map((_: unknown,index: number)=>index)
  const interleaved = structuredClone(document)
  const interleavedBytes = Buffer.concat([originalBinary,Buffer.alloc(65536-originalBinary.length)])
  interleaved.buffers[0].byteLength = 65536; interleaved.bufferViews[0].byteLength = 65536; interleaved.bufferViews[0].byteStride = 16
  const empty = structuredClone(document); empty.accessors[0].count = 0
  const manyObjects = structuredClone(document); manyObjects.accessors[0].count = 3
  manyObjects.meshes[0].primitives = Array.from({length:4},()=>({attributes:{POSITION:0},material:0}))
  manyObjects.nodes = Array.from({length:10000},()=>({mesh:0})); manyObjects.scenes[0].nodes = manyObjects.nodes.map((_:unknown,index:number)=>index)
  const payloads = [pack(custom,originalBinary),pack(indices,binary),pack(interleaved,interleavedBytes),pack(empty,originalBinary),pack(manyObjects,originalBinary)]
  for (const payload of payloads) assert.throws(() => decodeGlb(payload), /Invalid component models/)
})
