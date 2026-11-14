import type { Artwork } from './artwork'
import type { BoardPackage } from './boardPackage'
export const boardTargets = (board: BoardPackage, side: string) => {
  const b = board.bounds
  const targets = [{ x: b.x + b.width / 2, y: b.y + b.height / 2, name: 'Board center' }, { x: b.x, y: b.y, name: 'Top left edge' }, { x: b.x + b.width, y: b.y, name: 'Top right edge' }, { x: b.x, y: b.y + b.height, name: 'Bottom left edge' }, { x: b.x + b.width, y: b.y + b.height, name: 'Bottom right edge' }]
  for (const a of board.anchors ?? []) if (!a.side || a.side === side) targets.push({ x: a.x, y: a.y, name: `${a.kind === 'pad' ? 'Pad' : 'Footprint'} ${a.name}` })
  return targets
}
export const snapBoardPoint = (point: { x: number; y: number }, board: BoardPackage, side: string, grid: number, tolerance = .4) => {
  let x = Math.round((point.x - board.bounds.x) / grid) * grid + board.bounds.x, y = Math.round((point.y - board.bounds.y) / grid) * grid + board.bounds.y, name = 'Grid'
  let distance = tolerance
  for (const target of boardTargets(board, side)) {
    const d = Math.hypot(point.x - target.x, point.y - target.y)
    if (d <= distance) { x = target.x; y = target.y; name = target.name; distance = d }
  }
  for (const edge of [board.bounds.x, board.bounds.x + board.bounds.width / 2, board.bounds.x + board.bounds.width]) if (Math.abs(point.x - edge) < tolerance && name === 'Grid') x = edge
  for (const edge of [board.bounds.y, board.bounds.y + board.bounds.height / 2, board.bounds.y + board.bounds.height]) if (Math.abs(point.y - edge) < tolerance && name === 'Grid') y = edge
  return { x, y, name }
}
export const repeatedArtwork = (selected: Artwork[], mode: 'line' | 'circle', count: number, dx: number, dy: number, radius: number) => {
  if (!selected.length || !Number.isInteger(count) || count < 2 || count > 50 || ![dx, dy, radius].every(n => Number.isFinite(n) && Math.abs(n) <= 1000) || radius < 0 || new Set(selected.map(i => i.side)).size !== 1) throw new Error('Select artwork on one side and use 2–50 copies within 1000 mm.')
  const minX = Math.min(...selected.map(i => i.x)), maxX = Math.max(...selected.map(i => i.x + i.width)), minY = Math.min(...selected.map(i => i.y)), maxY = Math.max(...selected.map(i => i.y + i.height)), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const result: Artwork[] = []
  for (let index = 1; index < count; index++) {
    const radians = index * Math.PI * 2 / count, cos = Math.cos(radians), sin = Math.sin(radians)
    const ids = new Map(selected.map(item => [item.id, crypto.randomUUID()]))
    for (const item of selected) {
      const x = item.x + item.width / 2 - cx, y = item.y + item.height / 2 - cy
      const tx = mode === 'line' ? item.x + dx * index : cx + radius * Math.cos(radians) - radius + cos * x - sin * y - item.width / 2
      const ty = mode === 'line' ? item.y + dy * index : cy + radius * Math.sin(radians) + sin * x + cos * y - item.height / 2
      result.push({ ...JSON.parse(JSON.stringify(item)), id: ids.get(item.id)!, parentId: item.parentId && ids.has(item.parentId) ? ids.get(item.parentId) : item.parentId, x: tx, y: ty, rotation: item.rotation + (mode === 'circle' ? index * 360 / count : 0) })
    }
  }
  return result
}
