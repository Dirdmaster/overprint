type Point = { x: number; y: number }
type Bounds = { x: number; y: number; width: number; height: number }
type Contour = { points: Point[]; path: string; bounds: Bounds; area: number }
export type PaintRegion = { path: string; bounds: Bounds }

// KiCad's package contains polygon paths, not arbitrary SVG curves. Only closed
// M/L/Z contours participate; an open line must never become a paint boundary.
const contours = (paths: string[]): Contour[] => paths.flatMap(path => {
  const tokens = path.match(/[MLZmlz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? []
  const result: Contour[] = []
  let points: Point[] = [], current: Point = { x: 0, y: 0 }, command = ''
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i]!
    if (/^[MLZ]$/i.test(token)) { command = token; i++ }
    if (/^z$/i.test(command)) {
      if (points.length >= 3) {
        const extent = points.reduce<{ x: number; y: number; right: number; bottom: number }>((b, p) => ({ x: Math.min(b.x, p.x), y: Math.min(b.y, p.y), right: Math.max(b.right, p.x), bottom: Math.max(b.bottom, p.y) }), { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity })
        const area = Math.abs(points.reduce((sum, p, j) => { const next = points[(j + 1) % points.length]!; return sum + p.x * next.y - next.x * p.y }, 0)) / 2
        if (area > 0) result.push({ points, path: `M${points.map(p => `${p.x},${p.y}`).join(' L')} Z`, bounds: { x: extent.x, y: extent.y, width: extent.right - extent.x, height: extent.bottom - extent.y }, area })
        current = points[0]!
      }
      points = []; command = ''; continue
    }
    if (!/^[ML]$/i.test(command) || i + 1 >= tokens.length || /^[MLZ]$/i.test(tokens[i]!)) break
    const x = Number(tokens[i++]), y = Number(tokens[i++])
    if (!Number.isFinite(x) || !Number.isFinite(y)) break
    const relative = command === command.toLowerCase()
    current = { x: x + (relative ? current.x : 0), y: y + (relative ? current.y : 0) }
    if (/^m$/i.test(command)) { points = []; command = relative ? 'l' : 'L' }
    points.push(current)
  }
  return result
})

const inBounds = (point: Point, b: Bounds) => point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height
const contains = (ring: Contour, point: Point) => {
  if (!inBounds(point, ring.bounds)) return false
  let inside = false
  for (let i = 0, j = ring.points.length - 1; i < ring.points.length; j = i++) {
    const a = ring.points[i]!, b = ring.points[j]!
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export const createPaintRegions = (paths: string[]) => {
  const rings = contours(paths).sort((a, b) => a.area - b.area)
  const cache = new Map<Contour, PaintRegion>()
  return (point: Point): PaintRegion | undefined => {
    const ring = rings.find(candidate => contains(candidate, point))
    if (!ring) return
    const cached = cache.get(ring)
    if (cached) return cached
    // Exclude direct child contours, including separate KiCad paths. A warning
    // triangle's exclamation mark therefore survives a fill inside the triangle.
    const children: Contour[] = []
    for (const candidate of [...rings].reverse()) {
      if (candidate.area >= ring.area || !inBounds(candidate.bounds, ring.bounds)) continue
      const corner = { x: candidate.bounds.x + candidate.bounds.width, y: candidate.bounds.y + candidate.bounds.height }
      if (!inBounds(corner, ring.bounds) || !candidate.points.every(p => contains(ring, p))) continue
      if (!children.some(child => contains(child, candidate.points[0]!))) children.push(candidate)
    }
    const region = { path: [ring.path, ...children.map(child => child.path)].join(' '), bounds: ring.bounds }
    cache.set(ring, region)
    return region
  }
}

export const paintRegionSource = (region: PaintRegion, color: string, side: string) => {
  const { x, y, width, height } = region.bounds
  // Artwork is authored facing the viewer. Counter-mirror native bottom geometry
  // here because the shared artwork renderer already mirrors it into board space.
  const transform = side === 'back' ? ` transform="translate(${2 * x + width} 0) scale(-1 1)"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" data-overprint-fill="true"><path${transform} d="${region.path}" fill="${color}" fill-rule="evenodd"/></svg>`
}
