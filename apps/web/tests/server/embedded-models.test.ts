import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extractKicadBoardWithModels } from '../../app/utils/kicad/extract.ts'
import { decodeGlb } from '../../app/utils/boardModels.ts'
const fixture = readFileSync(new URL('../fixtures/embedded-models.kicad_pcb', import.meta.url), 'utf8')
const require = createRequire(import.meta.url)
const converter = await require('occt-import-js')()
test('imports native embedded STEP components as a self-contained assembled board', async () => {
  const board = await extractKicadBoardWithModels(fixture, 'embedded.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, { linearUnit: 'millimeter' }))
  assert.equal(board.models?.status, 'ready')
  assert.deepEqual(board.models?.includedReferences, ['U1', 'U2'])
  assert.ok(decodeGlb(board.models!.glb!, board.models!.encoding).length > 100)
})

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Box3, Vector3 } from 'three'
const meshPoints = async (bytes: Uint8Array) => {
  const scene = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '')).scene
  scene.updateMatrixWorld(true)
  const points: Vector3[] = []
  scene.traverse(object => { if ('isMesh' in object) {
    const mesh = object as import('three').Mesh
    const position = mesh.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) points.push(new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld))
  } })
  return points
}
test('embedded STEP placement matches native KiCad GLB on both board sides', async () => {
  const board = await extractKicadBoardWithModels(fixture, 'embedded.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, { linearUnit: 'millimeter' }))
  const actual = await meshPoints(decodeGlb(board.models!.glb!, board.models!.encoding))
  const expected = await meshPoints(readFileSync(new URL('../fixtures/embedded-native.glb', import.meta.url)))
  for (const [left, right] of [[actual, expected], [expected, actual]]) for (const point of left!) {
    const distance = Math.min(...right!.map(other => point.distanceTo(other)))
    assert.ok(distance < 0.00001, `vertex ${point.toArray()} differs by ${distance * 1000} mm`)
  }
})

test('a corrupt or missing embedded model preserves usable 2D geometry', async () => {
  for (const input of [fixture.replace(/\(checksum "[a-f\d]+"\)/, '(checksum "bad")'), fixture.replaceAll('kicad-embed://body.step', 'kicad-embed://absent.step')]) {
    const board = await extractKicadBoardWithModels(input, 'broken.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, {}))
    assert.equal(board.models?.status, 'unavailable')
    assert.equal(board.models?.missing.length, 2)
    assert.ok(board.outline)
  }
})
test('shared embedded geometry is converted once and hidden models stay hidden', async () => {
  let calls = 0
  const board = await extractKicadBoardWithModels(fixture, 'shared.kicad_pcb', () => {}, async bytes => { calls++; return converter.ReadStepFile(bytes, {}) })
  assert.equal(calls, 1)
  assert.equal(board.models?.includedReferences.length, 2)
  const hidden = await extractKicadBoardWithModels(fixture.replaceAll('(model "kicad-embed://body.step"', '(model "kicad-embed://body.step" (hide yes)'), 'hidden.kicad_pcb', () => {}, async () => { throw new Error('must not convert') })
  assert.equal(hidden.models?.status, 'empty')
})

test('accepts the native KiCad Murmur128 checksum as well as SHA256', async () => {
  // Oracle computed with KiCad 10's MMH3_HASH header and embedded-files seed.
  const input = fixture.replace(/\(checksum "[a-f\d]+"\)/, '(checksum "94BAFB01C51B32259A3A803691E089CC")')
  const board = await extractKicadBoardWithModels(input, 'native-hash.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, {}))
  assert.equal(board.models?.status, 'ready')
})

test('footprint-scoped payloads resolve and one missing component leaves the other visible', async () => {
  const input = fixture.replace('kicad-embed://body.step', 'kicad-embed://absent.step')
  const board = await extractKicadBoardWithModels(input, 'partial.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, {}))
  assert.equal(board.models?.status, 'partial')
  assert.deepEqual(board.models?.includedReferences, ['U2'])
  const { parseSExpr, children, child } = await import('../../app/utils/kicad/sexpr.ts')
  const parsed = parseSExpr(fixture), embedded = child(parsed, 'embedded_files')
  parsed.splice(parsed.indexOf(embedded), 1)
  for (const fp of children(parsed, 'footprint')) fp.push(embedded)
  const serialize = (node: any): string => Array.isArray(node) ? `(${node.map(serialize).join(' ')})` : JSON.stringify(node)
  const scoped = await extractKicadBoardWithModels(serialize(parsed), 'scoped.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, {}))
  assert.equal(scoped.models?.status, 'ready')
})
test('oversized, truncated and invalid compressed payloads fail before conversion', async () => {
  const huge = Buffer.alloc(9); huge.writeUInt32LE(0xfd2fb528); huge[4] = 0xa0; huge.writeUInt32LE(64 * 1024 * 1024, 5)
  for (const payload of [huge.toString('base64'), '!!!!', 'KLUv/Q==']) {
    const input = fixture.replace(/\(data\s*\|[^|]+\|\)/, `(data |${payload}|)`)
    const board = await extractKicadBoardWithModels(input, 'invalid.kicad_pcb', () => {}, async () => { assert.fail('invalid payload reached converter') })
    assert.equal(board.models?.status, 'unavailable')
    assert.equal(board.models?.missing.length, 2)
  }
})

import { importBoardFile } from '../../app/utils/importBoardFile.ts'
test('model timeout keeps geometry while cancellation preserves the previous project', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const make = () => {
    let terminated = false
    const worker = { postMessage: () => {}, terminate: () => { terminated = true }, onmessage: null as any, onerror: null as any }
    return { worker, stopped: () => terminated }
  }
  const { extractKicadBoard } = await import('../../app/utils/kicad/extract.ts')
  const geometry = extractKicadBoard(fixture, 'geometry.kicad_pcb')
  const first = make(), pending = importBoardFile(new File([fixture], 'test.kicad_pcb'), undefined, () => first.worker as unknown as Worker)
  await new Promise(resolve => setImmediate(resolve))
  first.worker.onmessage({ data: { geometry } })
  context.mock.timers.tick(30_000)
  assert.match((await pending).browserImport!.warnings.join(' '), /timed out/)
  assert.ok(first.stopped())
  const second = make(), controller = new AbortController()
  const cancelled = importBoardFile(new File([fixture], 'test.kicad_pcb'), controller.signal, () => second.worker as unknown as Worker)
  await new Promise(resolve => setImmediate(resolve))
  second.worker.onmessage({ data: { geometry } })
  controller.abort()
  await assert.rejects(cancelled, /cancelled/)
  assert.ok(second.stopped())
})

test('imports mixed embedded STEP and static WRL components with their material colors', async () => {
  const mixed = readFileSync(new URL('../fixtures/embedded-mixed.kicad_pcb', import.meta.url), 'utf8')
  const board = await extractKicadBoardWithModels(mixed, 'mixed.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, {}))
  assert.equal(board.models?.status, 'ready')
  assert.deepEqual(board.models?.includedReferences, ['U1', 'U2'])
})

import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js'
import { Mesh, type MeshPhongMaterial } from 'three'
test('WRL model units, internal hierarchy and both footprint transforms match native KiCad', async () => {
  const wrl = readFileSync(new URL('../fixtures/embedded-wrl.kicad_pcb', import.meta.url), 'utf8')
  const board = await extractKicadBoardWithModels(wrl, 'wrl.kicad_pcb', () => {})
  assert.equal(board.models?.status, 'ready')
  const actual = await meshPoints(decodeGlb(board.models!.glb!, board.models!.encoding))
  const native = new VRMLLoader().parse(readFileSync(new URL('../fixtures/embedded-native.wrl', import.meta.url), 'utf8'), '')
  native.updateMatrixWorld(true)
  const expected: Vector3[] = []
  native.traverse(object => {
    if (!(object instanceof Mesh) || (object.material as MeshPhongMaterial).color.r < 0.5) return
    const position = object.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const point = new Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld)
      // Native VRML places copper surfaces at +/-0.8 mm. Use the STEP/GLB
      // surface convention for both formats: top 1.595 mm, bottom -0.085 mm.
      expected.push(new Vector3(point.x / 1000, (point.z + (point.x < 30 ? 0.795 : 0.715)) / 1000, -point.y / 1000))
    }
  })
  assert.ok(expected.length > 0)
  for (const [left, right] of [[actual, expected], [expected, actual]]) for (const point of left!) assert.ok(Math.min(...right!.map(other => point.distanceTo(other))) < 0.00001)
})

import { createHash } from 'node:crypto'
const replaceWrl = async (content: string) => {
  const { parseSExpr, children, child } = await import('../../app/utils/kicad/sexpr.ts')
  const parsed = parseSExpr(readFileSync(new URL('../fixtures/embedded-mixed.kicad_pcb', import.meta.url), 'utf8'))
  const file = children(child(parsed, 'embedded_files'), 'file').find(file => child(file, 'name')[1] === 'body.wrl')!
  const bytes = Buffer.from(content), frame = Buffer.alloc(12 + bytes.length)
  frame.writeUInt32LE(0xfd2fb528); frame[4] = 0xa0; frame.writeUInt32LE(bytes.length, 5)
  frame.writeUIntLE((bytes.length << 3) | 1, 9, 3); bytes.copy(frame, 12)
  child(file, 'data').splice(1, Infinity, `|${frame.toString('base64')}|`)
  child(file, 'checksum')[1] = createHash('sha256').update(bytes).digest('hex')
  const serialize = (node: any): string => Array.isArray(node) ? `(${node.map(serialize).join(' ')})` : JSON.stringify(node)
  return serialize(parsed)
}
test('unsupported or excessive WRL content leaves the STEP component usable', async () => {
  for (const content of ['Inline { url "https://forbidden.invalid/model.wrl" }', 'Script { url "javascript:alert(1)" }', 'Transform { center 1 0 0 children [] }', 'Group { children ['.repeat(70), 'DEF recursive Group { children [ USE recursive ] }']) {
    const board = await extractKicadBoardWithModels(await replaceWrl('#VRML V2.0 utf8\n' + content), 'partial.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, {}))
    assert.equal(board.models?.status, 'partial')
    assert.deepEqual(board.models?.includedReferences, ['U2'])
    assert.equal(board.models?.missing[0]?.reference, 'U1')
  }
})

test('concave WRL faces are reported instead of silently triangulated incorrectly', async () => {
  const content = '#VRML V2.0 utf8\nShape { geometry IndexedFaceSet { convex FALSE coord Coordinate { point [0 0 0, 3 0 0, 3 3 0, 2 3 0, 2 1 0, 1 1 0, 1 3 0, 0 3 0] } coordIndex [0 1 2 3 4 5 6 7 -1] } }'
  const board = await extractKicadBoardWithModels(await replaceWrl(content), 'concave.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, {}))
  assert.equal(board.models?.status, 'partial')
  assert.match(board.models!.missing[0]!.reason, /concave/i)
})

test('reports references beyond the model instance limit', async () => {
  const { parseSExpr, children, child } = await import('../../app/utils/kicad/sexpr.ts')
  const parsed = parseSExpr(fixture), footprints = children(parsed, 'footprint')
  for (const fp of footprints) parsed.splice(parsed.indexOf(fp), 1)
  for (let i = 0; i < 1001; i++) {
    const fp = structuredClone(footprints[0]!)
    children(fp, 'property').find(p => p[1] === 'Reference')![2] = `U${i}`
    parsed.push(fp)
  }
  const serialize = (node: any): string => Array.isArray(node) ? `(${node.map(serialize).join(' ')})` : JSON.stringify(node)
  const board = await extractKicadBoardWithModels(serialize(parsed), 'many.kicad_pcb', () => {}, async bytes => converter.ReadStepFile(bytes, {}))
  assert.equal(board.models?.status, 'partial')
  assert.ok(board.models?.missing.some(model => model.reference === 'U1000' && /limit/.test(model.reason)))
})
