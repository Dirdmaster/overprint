import ClipperLib from 'clipper-lib'
import type { BoardPackage } from './boardPackage'
import { polygonRings } from './enigPaint'

const gerberUnitsPerMm = 100_000
const svgUnitMm = .254
const markDiameterMm = .508
const markInsetMm = .762
type Point = ClipperLib.IntPoint

const distanceSquared = (a: Point, b: Point) => (a.X - b.X) ** 2 + (a.Y - b.Y) ** 2

const selectMarks = (inset: ClipperLib.Paths, targets: Point[]) => {
  // EasyEDA samples the inset contour and chooses the points nearest three
  // targets at 10% inside the nominal corners.
  const candidates = inset.flatMap(ring => ring.flatMap((a, index) => {
    const b = ring[(index + 1) % ring.length]!
    const steps = Math.max(1, Math.ceil(Math.sqrt(distanceSquared(a, b)) / (svgUnitMm * gerberUnitsPerMm)))
    return Array.from({ length: steps }, (_, step) => ({
      X: Math.round(a.X + (b.X - a.X) * step / steps),
      Y: Math.round(a.Y + (b.Y - a.Y) * step / steps),
    }))
  }))
  const minimumSpacingSquared = (markDiameterMm * gerberUnitsPerMm) ** 2
  const marks: Point[] = []
  for (const target of targets) {
    let closest: Point | undefined
    let bestDistance = Infinity
    for (const candidate of candidates) {
      const distance = distanceSquared(candidate, target)
      if (distance < bestDistance && marks.every(mark => distanceSquared(mark, candidate) >= minimumSpacingSquared)) {
        closest = candidate
        bestDistance = distance
      }
    }
    if (!closest) break
    marks.push(closest)
  }
  return marks
}

export const colorRegistration = (board: BoardPackage) => {
  const profile = polygonRings(board.outline)
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(profile, ClipperLib.PolyType.ptSubject, true)
  if (board.holes) clipper.AddPaths(polygonRings(board.holes), ClipperLib.PolyType.ptClip, true)
  const material: ClipperLib.Paths = []
  clipper.Execute(ClipperLib.ClipType.ctDifference, material, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd)
  const { x, y, width, height } = board.bounds
  const targets = [
    { X: x + .1 * width, Y: y + .9 * height },
    { X: x + .1 * width, Y: y + .1 * height },
    { X: x + .9 * width, Y: y + .1 * height },
  ].map(({ X, Y }) => ({ X: X * gerberUnitsPerMm, Y: Y * gerberUnitsPerMm }))
  let marks: Point[] = []
  // A narrow board may fit the mark diameter but have no contour at the
  // usual inset. Try again with just over one mark radius of clearance.
  for (const clearance of [markInsetMm, markDiameterMm / 2 + .001]) {
    const offset = new ClipperLib.ClipperOffset()
    offset.AddPaths(material, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
    const inset: ClipperLib.Paths = []
    offset.Execute(inset, -clearance * gerberUnitsPerMm)
    marks = selectMarks(inset, targets)
    if (marks.length === targets.length) break
  }
  if (marks.length < targets.length) throw new Error('The board outline cannot fit three color registration marks.')

  // Both color SVGs and FCBM use the same marks, with Gerber Y pointing up.
  const svgMarks = marks.flatMap(({ X, Y }) => [X, -Y]).map(value => value / gerberUnitsPerMm / svgUnitMm).join(' ')
  const coordinate = ({ X, Y }: Point, op: '01' | '02' | '03') => `X${X}Y${-Y}D${op}*`
  let integerDigits = 4
  for (const ring of profile) for (const { X, Y } of ring) {
    const wholeMm = Math.floor(Math.max(Math.abs(X), Math.abs(Y)) / gerberUnitsPerMm)
    integerDigits = Math.max(integerDigits, String(wholeMm).length)
  }
  if (integerDigits > 6) throw new Error('The board outline exceeds the Gerber coordinate range.')
  const format = `%FSLAX${integerDigits}5Y${integerDigits}5*%`
  const contour = profile.flatMap(ring => [
    coordinate(ring[0]!, '02'),
    ...ring.slice(1).map(point => coordinate(point, '01')),
    coordinate(ring[0]!, '01'),
  ])
  const gerber = [
    'G04 Fabrication_ColorfulBoardOutlineMark*', format, '%MOMM*%', '%LPD*%',
    '%ADD10C,0.15*%', `%ADD11C,${markDiameterMm}*%`,
    'D10*', ...contour, 'D11*', ...marks.map(point => coordinate(point, '03')), 'M02*',
  ].join('\n') + '\n'
  return { svgMarks, gerber }
}
