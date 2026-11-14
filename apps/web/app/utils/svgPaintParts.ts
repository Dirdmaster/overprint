import ClipperLib from 'clipper-lib'
import { closedSvgPaths } from './svgCutouts'
const ns = 'http://www.w3.org/2000/svg'
const scale = 10000
/** Separate disjoint closed contours without changing any saved curve commands.
 * Intersecting/nested contours stay together so winding, holes and islands retain
 * their original appearance. Expanded probes conservatively keep near-touching
 * curves together; sampled polygons are only used to classify connectivity.
 */
export const svgPaintParts = (node: SVGGeometryElement): string[] | undefined => {
  if (node.localName !== 'path' || node.hasAttribute('data-overprint-cutout')) return
  const d = node.getAttribute('d') ?? ''
  const paths = closedSvgPaths(d)
  if (paths.length < 2 || paths.length > 128 || paths.length !== (d.match(/[Mm]/g)?.length ?? 0)) return
  const style = getComputedStyle(node)
  if (style.fill === 'none' || style.fill.startsWith('url(') || style.stroke.startsWith('url(')) return
  let budget = 0
  const contours = paths.map(path => {
    const probe = document.createElementNS(ns, 'path')
    probe.setAttribute('d', path)
    node.parentNode!.append(probe)
    try {
      const length = probe.getTotalLength(), bounds = probe.getBBox()
      if (!Number.isFinite(length) || !length) return
      const count = Math.min(512, Math.max(128, Math.ceil(length)))
      budget += count
      if (budget > 16384) return
      const ring = Array.from({ length: count }, (_, i) => {
        const p = probe.getPointAtLength(length * i / count)
        return { X: Math.round(p.x * scale), Y: Math.round(p.y * scale) }
      })
      // An arc between probes stays within its arc length of the chord. This
      // margin avoids splitting contours whose actual curves may intersect.
      const offset = new ClipperLib.ClipperOffset()
      const expanded: ClipperLib.Paths = []
      offset.AddPaths(ClipperLib.Clipper.SimplifyPolygon(ring, ClipperLib.PolyFillType.pftEvenOdd), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
      offset.Execute(expanded, Math.max(1, length / count * scale))
      return { path, bounds, expanded }
    } catch {
      // Malformed or excessive geometry keeps the existing whole-path behavior.
      return
    } finally { probe.remove() }
  })
  if (contours.some(contour => !contour)) return
  const groups = contours.map((_, index) => index)
  const root = (index: number): number => groups[index] === index ? index : root(groups[index]!)
  for (let i = 0; i < contours.length; i++) for (let j = i + 1; j < contours.length; j++) {
    const a = contours[i]!, b = contours[j]!
    if (a.bounds.x > b.bounds.x + b.bounds.width || b.bounds.x > a.bounds.x + a.bounds.width || a.bounds.y > b.bounds.y + b.bounds.height || b.bounds.y > a.bounds.y + a.bounds.height) continue
    const clipper = new ClipperLib.Clipper(), intersection: ClipperLib.Paths = []
    clipper.AddPaths(a.expanded, ClipperLib.PolyType.ptSubject, true)
    clipper.AddPaths(b.expanded, ClipperLib.PolyType.ptClip, true)
    clipper.Execute(ClipperLib.ClipType.ctIntersection, intersection, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
    if (intersection.length) groups[root(j)] = root(i)
  }
  const parts = new Map<number, string[]>()
  contours.forEach((contour, i) => {
    const key = root(i)
    if (!parts.has(key)) parts.set(key, [])
    parts.get(key)!.push(contour!.path)
  })
  return parts.size > 1 ? [...parts.values()].map(paths => paths.join(' ')) : undefined
}
