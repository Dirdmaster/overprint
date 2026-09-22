import ClipperLib from 'clipper-lib'
export type Point = [number, number]
export type Ring = Point[]
const SCALE = 100000
export const TOLERANCE = 0.005
export const round = (n: number) => Math.round(n * 1e6) / 1e6
export const path = (rings: Ring[]) => rings.map(r => `M${r.map(p => p.map(round).join(',')).join(' L')} Z`).join(' ')
const integers = (ring: Ring) => ring.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }))
const points = (ring: ClipperLib.Path): Ring => ring.map(p => [p.X / SCALE, p.Y / SCALE])
export const union = (rings: Ring[]): Ring[] => {
  if (!rings.length) return []
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(rings.map(integers), ClipperLib.PolyType.ptSubject, true)
  const result: ClipperLib.Paths = []
  clipper.Execute(ClipperLib.ClipType.ctUnion, result, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return result.map(points)
}
/** Keep each connected polygon editable separately, with its own interior holes. */
export const unionPaths = (rings: Ring[]): string[] => {
  if (!rings.length) return []
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(rings.map(integers), ClipperLib.PolyType.ptSubject, true)
  const tree = new ClipperLib.PolyTree()
  clipper.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return ClipperLib.JS.PolyTreeToExPolygons(tree).map(p => path([p.outer, ...p.holes].map(points)))
}
export const offset = (rings: Ring[], distance: number, closed = true): Ring[] => {
  if (!rings.length || (distance === 0 && !closed)) return []
  if (distance === 0) return rings
  const clipper = new ClipperLib.ClipperOffset(2, TOLERANCE * SCALE)
  clipper.AddPaths(rings.map(integers), ClipperLib.JoinType.jtRound, closed ? ClipperLib.EndType.etClosedPolygon : ClipperLib.EndType.etOpenRound)
  const result: ClipperLib.Paths = []
  clipper.Execute(result, distance * SCALE)
  return result.map(points)
}
export const positive = (ring: Ring): Ring => ClipperLib.Clipper.Orientation(integers(ring)) ? ring : [...ring].reverse()
export const transform = (p: Point, origin: Point, degrees: number): Point => {
  const angle = -degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  return [origin[0] + p[0] * c - p[1] * s, origin[1] + p[0] * s + p[1] * c]
}
export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const circle = (center: Point, radius: number): Ring => {
  if (radius <= 0) return []
  const count = Math.max(16, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - TOLERANCE / radius))))
  if (count > 20000) throw new Error('KiCad curve exceeds the geometry limit.')
  return Array.from({ length: count }, (_, i) => [center[0] + radius * Math.cos(i * Math.PI * 2 / count), center[1] + radius * Math.sin(i * Math.PI * 2 / count)])
}
export const arc = (a: Point, b: Point, c: Point): Ring => {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
  if (Math.abs(d) < 1e-12) throw new Error('Invalid collinear arc in KiCad PCB.')
  const aa = a[0] ** 2 + a[1] ** 2, bb = b[0] ** 2 + b[1] ** 2, cc = c[0] ** 2 + c[1] ** 2
  const center: Point = [(aa * (b[1] - c[1]) + bb * (c[1] - a[1]) + cc * (a[1] - b[1])) / d, (aa * (c[0] - b[0]) + bb * (a[0] - c[0]) + cc * (b[0] - a[0])) / d]
  const start = Math.atan2(a[1] - center[1], a[0] - center[0])
  const tau = Math.PI * 2, relative = (p: Point) => (Math.atan2(p[1] - center[1], p[0] - center[0]) - start + tau) % tau
  let sweep = relative(c)
  if (relative(b) > sweep) sweep -= tau
  const radius = distance(a, center), count = Math.max(2, Math.ceil(Math.abs(sweep) / (2 * Math.acos(Math.max(-1, 1 - TOLERANCE / radius)))))
  if (count > 20000) throw new Error('KiCad arc exceeds the geometry limit.')
  return Array.from({ length: count + 1 }, (_, i) => i === 0 ? a : i === count ? c : [center[0] + radius * Math.cos(start + sweep * i / count), center[1] + radius * Math.sin(start + sweep * i / count)])
}
export const rectangle = (w: number, h: number): Ring => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
export const roundedRect = (w: number, h: number, r: number): Ring[] => {
  if (w <= 0 || h <= 0) return []
  r = Math.min(r, w / 2, h / 2)
  if (r <= 0) return [rectangle(w, h)]
  if (Math.abs(w - h) < 1e-9 && r === w / 2) return [circle([0, 0], r)]
  if (r === Math.min(w, h) / 2) return offset([[[-(w / 2 - r), -(h / 2 - r)], [w / 2 - r, h / 2 - r]]], r, false)
  return offset([rectangle(w - 2 * r, h - 2 * r)], r)
}
/** Stitch unordered/reversed Edge.Cuts into closed loops, preserving internal cutouts. */
export const stitch = (segments: Ring[]): Ring[] => {
  const remaining = segments.filter(s => s.length >= 2).map(s => [...s]), result: Ring[] = []
  while (remaining.length) {
    const ring = remaining.pop()!
    while (distance(ring[0]!, ring.at(-1)!) > 0.001) {
      const matches = remaining.map((s, i) => ({ i, reverse: distance(ring.at(-1)!, s.at(-1)!) <= 0.001, start: distance(ring.at(-1)!, s[0]!) <= 0.001 })).filter(m => m.reverse || m.start)
      if (matches.length !== 1) throw new Error('The board needs a closed, unambiguous Edge.Cuts outline.')
      const match = matches[0]!, next = remaining.splice(match.i, 1)[0]!
      ring.push(...(match.reverse ? next.reverse() : next).slice(1))
    }
    ring.pop()
    if (ring.length < 3 || Math.abs(ClipperLib.Clipper.Area(integers(ring))) < 1) throw new Error('The board outline has no area.')
    result.push(ring)
  }
  if (!result.length) throw new Error('The board needs a closed Edge.Cuts outline.')
  return result
}

/** Union nearby complete shapes first; keep each outer ring with its holes. */
export const unionShapePaths = (shapes: Ring[][]): string[] => {
  if (shapes.length <= 128) return unionPaths(shapes.flat())
  const entries = shapes.filter(shape => shape.length).map(shape => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const ring of shape) for (const [x, y] of ring) {
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
    return { shape, x: (left + right) / 2, y: (top + bottom) / 2 }
  })
  const merge = (items: typeof entries): Ring[] => {
    if (items.length <= 64) return union(items.flatMap(item => item.shape))
    const extent = (key: 'x' | 'y') => {
      let low = Infinity, high = -Infinity
      for (const item of items) { low = Math.min(low, item[key]); high = Math.max(high, item[key]) }
      return high - low
    }
    const axis = extent('x') >= extent('y') ? 'x' : 'y'
    items.sort((a, b) => a[axis] - b[axis])
    const midpoint = Math.floor(items.length / 2)
    return union([...merge(items.slice(0, midpoint)), ...merge(items.slice(midpoint))])
  }
  return unionPaths(merge(entries))
}
