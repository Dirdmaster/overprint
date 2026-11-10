import { LoadingManager, Mesh, Vector3, type MeshPhongMaterial } from 'three'
import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js'
import type { ModelMesh } from './modelGlb.ts'
const nodes = new Set('Group Transform Shape Appearance Material Coordinate Normal IndexedFaceSet Box Cylinder Cone Sphere'.split(' '))
const fields = new Set('children appearance material geometry diffuseColor ambientIntensity specularColor emissiveColor shininess transparency coord point coordIndex normal vector normalIndex normalPerVertex solid ccw convex creaseAngle translation rotation scale center scaleOrientation bboxCenter bboxSize size radius height bottomRadius bottom side top TRUE FALSE NULL'.split(' '))

// Validate a deliberately static subset before invoking Three's general VRML loader.
// No URLs, textures, scripts, prototype definitions, or recursively reused groups.
const preflight = (text: string) => {
  if (!/^#VRML V2\.0 utf8\s/.test(text)) throw new Error('Only static VRML 2.0 WRL models are supported.')
  const source = text.replace(/#[^\r\n]*/g, ''), tokens: string[] = []
  const pattern = /\s+|,|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[{}\[\]]|[A-Za-z_][A-Za-z_\d-]*/y
  let offset = 0
  while (offset < source.length) {
    pattern.lastIndex = offset
    const match = pattern.exec(source)
    if (!match) throw new Error('Unsupported WRL content or external resource.')
    offset = pattern.lastIndex
    if (/^[\s,]/.test(match[0])) continue
    tokens.push(match[0])
    if (tokens.length > 250000) throw new Error('WRL model exceeds the parsing complexity limit.')
  }
  const definitions = new Map<string, { type: string; end: number }>(), stack: { token: string; def?: string }[] = []
  let count = 0, uses = 0
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token === 'DEF') {
      const name = tokens[++i]!, type = tokens[i + 1]!
      if (definitions.has(name) || ['__proto__', 'constructor', 'prototype'].includes(name) || !nodes.has(type)) throw new Error('Invalid WRL definition.')
      definitions.set(name, { type, end: Infinity })
      continue
    }
    if (token === 'USE') {
      const entry = definitions.get(tokens[++i]!)
      if (!entry || entry.end >= i || ['Group', 'Transform'].includes(entry.type) || ++uses > 100) throw new Error('Unsupported or excessive WRL reuse.')
      continue
    }
    if (token === '{' || token === '[') {
      const def = tokens[i - 3] === 'DEF' ? tokens[i - 2] : undefined
      stack.push({ token, def })
      if (stack.length > 64 || (token === '{' && ++count > 2000)) throw new Error('WRL model exceeds the nesting limit.')
    } else if (token === '}' || token === ']') {
      const open = stack.pop()
      if (open?.token !== (token === '}' ? '{' : '[')) throw new Error('Invalid WRL structure.')
      if (open.def) definitions.get(open.def)!.end = i
    } else if (!nodes.has(token) && !fields.has(token)) {
      if (!Number.isFinite(Number(token)) || Math.abs(Number(token)) >= 100000) throw new Error(`Unsupported WRL field: ${token.slice(0, 40)}.`)
    }
    if (token === 'center' && tokens.slice(i + 1, i + 4).some(n => Number(n) !== 0)) throw new Error('WRL transform centers are unsupported.')
    if (token === 'scaleOrientation' && Number(tokens[i + 4]) !== 0) throw new Error('WRL scale orientation is unsupported.')
    if (token === 'convex' && tokens[i + 1] === 'FALSE') throw new Error('Concave WRL faces are unsupported.')
    if (token === 'transparency' && Number(tokens[i + 1]) !== 0) throw new Error('Transparent WRL materials are unsupported.')
  }
  if (stack.length) throw new Error('Truncated WRL structure.')
}
export const wrlMeshes = (bytes: Uint8Array): ModelMesh[] => {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  preflight(text)
  const manager = new LoadingManager()
  manager.setURLModifier(() => { throw new Error('External WRL assets are unsupported.') })
  const scene = new VRMLLoader(manager).parse(text, '')
  scene.updateMatrixWorld(true)
  const result: ModelMesh[] = []
  let total = 0
  try {
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return
      const geometry = object.geometry, position = geometry.getAttribute('position')
      total += position.count * 24 + (geometry.index?.count ?? position.count) * 4
      if (total > 16 * 1024 * 1024 || result.length > 2000) throw new Error('WRL geometry exceeds the conversion limit.')
      if (Array.isArray(object.material) || geometry.hasAttribute('color')) throw new Error('WRL vertex colors are unsupported.')
      const positions: number[] = [], point = new Vector3()
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld).multiplyScalar(2.54)
        positions.push(point.x, point.y, point.z)
      }
      const indices = geometry.index ? Array.from(geometry.index.array, Number) : Array.from({ length: position.count }, (_, i) => i)
      if (object.matrixWorld.determinant() < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!]
      result.push({ positions, indices, color: (object.material as MeshPhongMaterial).color.toArray() })
    })
    if (!result.length) throw new Error('WRL model contains no supported solid geometry.')
    return result
  } finally {
    scene.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose() } })
  }
}
