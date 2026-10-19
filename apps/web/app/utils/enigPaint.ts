import ClipperLib from 'clipper-lib'
import { ShapeUtils } from 'three/src/extras/ShapeUtils.js'
import { Vector2 } from 'three/src/math/Vector2.js'
import type { Artwork } from './artwork'
import type { BoardPackage } from './boardPackage'

export type GoldRegion = { path: string; bounds: { x: number; y: number; width: number; height: number } }
export type GoldExportRegions = { copper: Point[][]; mask: Point[][] }
type Point = { X: number; Y: number }
const SCALE = 100000
const CLEARANCE_MM = 0.25
const toPoint = (x: number, y: number): Point => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })

// Board-package geometry and Live Paint regions are closed M/L/Z polygons.
// Reject anything else rather than approximating manufacturing geometry.
export const polygonRings = (path: string): Point[][] => {
  const rings: Point[][] = []
  const token = /[MmLlZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi
  const tokens = path.match(token) ?? []
  if (path.replace(token, '').replace(/[\s,]/g, '')) throw new Error('ENIG requires polygon geometry.')
  let command = '', current = { x: 0, y: 0 }, ring: Point[] = []
  for (let index = 0; index < tokens.length;) {
    const next = tokens[index]!
    if (/^[MmLlZz]$/.test(next)) { command = next; index++ }
    if (/^z$/i.test(command)) {
      if (ring.length < 3) throw new Error('ENIG requires a closed polygon region.')
      rings.push(ring)
      current = { x: ring[0]!.X / SCALE, y: ring[0]!.Y / SCALE }
      ring = []; command = ''
      continue
    }
    if (!/^[MmLl]$/.test(command) || index + 1 >= tokens.length || /^[MmLlZz]$/.test(tokens[index]!)) throw new Error('ENIG requires a closed polygon region.')
    const x = Number(tokens[index++]!), y = Number(tokens[index++]!)
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('ENIG has invalid coordinates.')
    const relative = command === command.toLowerCase()
    current = { x: x + (relative ? current.x : 0), y: y + (relative ? current.y : 0) }
    if (/^m$/i.test(command)) { ring = []; command = relative ? 'l' : 'L' }
    ring.push(toPoint(current.x, current.y))
  }
  if (ring.length) throw new Error('ENIG requires a closed polygon region.')
  if (!rings.length) throw new Error('ENIG requires a simple vector region.')
  return rings
}

export const goldItemRings = (item: Artwork): Point[][] => {
  if (!item.gold) return []
  const { bounds, path } = item.gold
  const sourceCenterX = bounds.x + bounds.width / 2
  const sourceCenterY = bounds.y + bounds.height / 2
  const targetCenterX = item.x + item.width / 2
  const targetCenterY = item.y + item.height / 2
  const scale = Math.min(item.width / bounds.width, item.height / bounds.height)
  const angle = item.rotation * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return polygonRings(path).map((ring) => ring.map(({ X, Y }) => {
    const x = (X / SCALE - sourceCenterX) * scale
    const y = (Y / SCALE - sourceCenterY) * scale
    return toPoint(targetCenterX + x * cos - y * sin, targetCenterY + x * sin + y * cos)
  }))
}

const clip = (subject: Point[][], other: Point[][], operation: number): Point[][] => {
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true)
  clipper.AddPaths(other, ClipperLib.PolyType.ptClip, true)
  const result: Point[][] = []
  clipper.Execute(operation, result, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd)
  return result
}
const expand = (rings: Point[][], distance: number): Point[][] => {
  if (!rings.length) return []
  const offset = new ClipperLib.ClipperOffset()
  offset.AddPaths(rings, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const result: Point[][] = []
  offset.Execute(result, distance * SCALE)
  return result
}
const area = (rings: Point[][]) => rings.reduce((sum, ring) => sum + Math.abs(ClipperLib.Clipper.Area(ring)), 0)

const goldContours = (rings: Point[][]): ClipperLib.ExPolygons => {
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(rings, ClipperLib.PolyType.ptSubject, true)
  const tree = new ClipperLib.PolyTree()
  clipper.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd)
  return ClipperLib.JS.PolyTreeToExPolygons(tree)
}

// Gerber clear polarity would erase native copper and mask inside a cutout.
// Triangulate the filled area into dark-only regions so the opening is untouched.
const solidGoldRegions = (polygons: ClipperLib.ExPolygons): Point[][] => polygons.flatMap(({ outer, holes }) => {
  if (!holes.length) return [outer]
  const all = [...outer, ...holes.flat()]
  const vertices = (ring: Point[]) => ring.map(({ X, Y }) => new Vector2(X / SCALE, Y / SCALE))
  const faces = ShapeUtils.triangulateShape(vertices(outer), holes.map(vertices))
  if (faces.length > 16384) throw new Error('This ENIG cutout is too complex to export safely.')
  const triangles = faces.map(face => face.map(index => all[index]!))
  const expected = Math.abs(ClipperLib.Clipper.Area(outer)) - area(holes)
  const actual = area(triangles)
  if (!triangles.length || Math.abs(actual - expected) > Math.max(10000, expected * 0.00001)) {
    throw new Error('This ENIG cutout could not be converted to safe copper geometry.')
  }
  return triangles
})

export const validateGoldRegions = (board: BoardPackage, artwork: Artwork[], side: string) => {
  const byId = new Map(artwork.map((item) => [item.id, item]))
  const visible = (item: Artwork): boolean => {
    const seen = new Set<string>()
    let current: Artwork | undefined = item
    while (current && !seen.has(current.id)) {
      if (!current.visible) return false
      seen.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return true
  }
  const gold = artwork.filter((item) => item.side === side && item.gold && visible(item))
  if (!gold.length) return { copper: [], mask: [] }
  if (!Array.isArray(board.layers[`${side}-copper`]) || !Array.isArray(board.layers[`${side}-mask`])) {
    throw new Error('ENIG requires copper and solder-mask geometry from a current board import.')
  }
  const outline = polygonRings(board.outline)
  const holes = board.holes ? polygonRings(board.holes) : []
  const copper = (board.layers[`${side}-copper`] ?? []).map(polygonRings)
  const mask = (board.layers[`${side}-mask`] ?? []).map(polygonRings)
  const placed: Point[][] = []
  const result: GoldExportRegions = { copper: [], mask: [] }
  for (const item of gold) {
    const rings = goldItemRings(item)
    const polygons = goldContours(rings)
    if (polygons.length !== 1 || !polygons[0]?.outer.length) {
      throw new Error(`ENIG layer “${item.name}” needs one enclosed region.`)
    }
    const contours = [polygons[0].outer, ...polygons[0].holes]
    const clearance = expand(contours, CLEARANCE_MM)
    if (area(clip(clearance, outline, ClipperLib.ClipType.ctDifference)) > 1 ||
        (holes.length && area(clip(clearance, holes, ClipperLib.ClipType.ctIntersection)) > 1) ||
        mask.some((rings) => rings.length && area(clip(clearance, rings, ClipperLib.ClipType.ctIntersection)) > 1) ||
        area(clip(clearance, placed, ClipperLib.ClipType.ctIntersection)) > 1) {
      throw new Error(`ENIG layer “${item.name}” is within ${CLEARANCE_MM} mm of a board edge, hole, mask opening, or another gold region.`)
    }
    const nearbyCopper = copper.flatMap((rings, index) => rings.length && area(clip(clearance, rings, ClipperLib.ClipType.ctIntersection)) > 1 ? [index] : [])
    const overlappingCopper = nearbyCopper.filter(index => area(clip(contours, copper[index]!, ClipperLib.ClipType.ctIntersection)) > 1)
    const coveringCopper = overlappingCopper.find(index => area(clip(contours, copper[index]!, ClipperLib.ClipType.ctDifference)) <= 1)
    const exposeExisting = coveringCopper !== undefined && overlappingCopper.length === 1
    if (!exposeExisting && nearbyCopper.length) {
      throw new Error(`ENIG layer “${item.name}” is within ${CLEARANCE_MM} mm of existing copper. Paint wholly over one continuous copper region or in clear space.`)
    }
    placed.push(...contours)
    const solid = solidGoldRegions(polygons)
    result.mask.push(...solid)
    if (!exposeExisting) result.copper.push(...solid)
  }
  return result
}

export const goldPath = (rings: Point[][]) => rings.map((ring) => `M${ring.map(({ X, Y }) => `${X / SCALE},${Y / SCALE}`).join(' L')} Z`).join(' ')

export const addGerberRegions = (gerber: string, rings: Point[][]): string => {
  if (!rings.length) return gerber
  const format = gerber.match(/%FSLAX(\d)(\d)Y(\d)(\d)\*%/)
  if (!format || !gerber.includes('%MOMM*%') || !/M02\*\s*$/.test(gerber)) throw new Error('ENIG requires millimetre KiCad Gerbers with a supported coordinate format.')
  const integer = Number(format[1]), decimal = Number(format[2])
  if (integer !== Number(format[3]) || decimal !== Number(format[4])) throw new Error('ENIG requires matching X and Y Gerber coordinates.')
  const used = new Set([...gerber.matchAll(/%ADD(\d+)/g)].map((match) => Number(match[1])))
  let aperture = 10
  while (used.has(aperture)) aperture++
  if (aperture > 999) throw new Error('The Gerber has no free aperture for ENIG.')
  const coordinate = (value: number) => {
    const scaled = Math.round(value * 10 ** decimal)
    if (Math.abs(scaled) >= 10 ** (integer + decimal)) throw new Error('ENIG geometry exceeds the Gerber coordinate range.')
    return `${scaled < 0 ? '-' : ''}${String(Math.abs(scaled)).padStart(integer + decimal, '0')}`
  }
  const commands = rings.flatMap((ring) => [
    'G36*',
    ...ring.map(({ X, Y }, index) => `X${coordinate(X / SCALE)}Y${coordinate(-Y / SCALE)}D0${index ? 1 : 2}*`),
    `X${coordinate(ring[0]!.X / SCALE)}Y${coordinate(-ring[0]!.Y / SCALE)}D01*`,
    'G37*'
  ])
  return gerber.replace(/M02\*\s*$/, `%ADD${aperture}C,0.001*%\n%LPD*%\nG01*\nD${aperture}*\n${commands.join('\n')}\nM02*\n`)
}
