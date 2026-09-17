// Keep curve commands intact. A relative moveto after a closed subpath is
// relative to that subpath's start; normalize only the initial moveto.
const number = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?'
const move = new RegExp(`^([Mm])\\s*(${number})[\\s,]*(${number})([\\s\\S]*)$`)
const closedPaths = (path: string) => {
  let origin: { x: number; y: number } | undefined = { x: 0, y: 0 }
  const result: string[] = []
  for (const part of path.match(/[Mm][^Mm]*/g) ?? []) {
    const match = part.match(move)
    if (!match) { origin = undefined; continue }
    const relative = match[1] === 'm'
    if (relative && !origin) continue
    const x: number = Number(match[2]) + (relative ? origin!.x : 0)
    const y: number = Number(match[3]) + (relative ? origin!.y : 0)
    const tail = match[4]!.trim()
    if (/[zZ]\s*$/.test(tail)) {
      const implicitLine = relative && /^[-+.\d]/.test(tail) ? 'l' : ''
      result.push(`M${x} ${y} ${implicitLine}${tail}`)
      origin = { x, y }
    } else origin = undefined
  }
  return result
}

export const createSvgCutouts = (node: SVGGeometryElement) => {
  if (node.localName !== 'path') return () => undefined
  const paths = closedPaths(node.getAttribute('d') ?? '')
  if (paths.length < 2) return () => undefined
  const context = document.createElement('canvas').getContext('2d')!
  const contours = paths.map(path => {
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    probe.setAttribute('d', path)
    node.parentNode!.appendChild(probe)
    const bounds = probe.getBBox()
    const length = probe.getTotalLength()
    const samples = Array.from({ length: 64 }, (_, index) => probe.getPointAtLength(length * index / 64))
    probe.remove()
    return { path, shape: new Path2D(path), bounds, samples }
  }).sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)
  const contains = (shape: Path2D, point: DOMPoint) => context.isPointInPath(shape, point.x, point.y, 'evenodd')
  return (point: DOMPoint) => {
    // Caller already ruled out painted ink. Two enclosing contours distinguish
    // a compound-path hole from empty space outside the graphic.
    const enclosing = contours.filter(contour => contains(contour.shape, point))
    if (enclosing.length < 2) return
    const hole = enclosing[0]!
    const children = contours.filter(contour => contour !== hole && contour.bounds.width * contour.bounds.height < hole.bounds.width * hole.bounds.height && contour.samples.every(sample => contains(hole.shape, sample)))
    return [hole.path, ...children.map(contour => contour.path)].join(' ')
  }
}
