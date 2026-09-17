import type { Artwork } from './artwork'

export type Alignment = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'
export type AlignmentBounds = { x: number; y: number; width: number; height: number }

// Measure the rotated SVG viewport in board coordinates, not its unrotated frame.
export const artworkBounds = (item: Artwork): AlignmentBounds => {
  const radians = item.rotation * Math.PI / 180
  const width = Math.abs(Math.cos(radians)) * item.width + Math.abs(Math.sin(radians)) * item.height
  const height = Math.abs(Math.sin(radians)) * item.width + Math.abs(Math.cos(radians)) * item.height
  return { x: item.x + (item.width - width) / 2, y: item.y + (item.height - height) / 2, width, height }
}

export const selectionBounds = (items: Artwork[]): AlignmentBounds => {
  const bounds = items.map(artworkBounds)
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y))
  return { x, y, width: Math.max(...bounds.map(b => b.x + b.width)) - x, height: Math.max(...bounds.map(b => b.y + b.height)) - y }
}

export const alignArtwork = (items: Artwork[], target: AlignmentBounds, alignment: Alignment, side: string): Artwork[] => {
  // The rear canvas mirrors board X coordinates. Left/right refer to the displayed side.
  let direction = alignment
  if (side === 'back' && alignment === 'left') direction = 'right'
  if (side === 'back' && alignment === 'right') direction = 'left'
  return items.map(item => {
    const bounds = artworkBounds(item)
    let dx = 0, dy = 0
    if (direction === 'left') dx = target.x - bounds.x
    if (direction === 'center-x') dx = target.x + target.width / 2 - bounds.x - bounds.width / 2
    if (direction === 'right') dx = target.x + target.width - bounds.x - bounds.width
    if (direction === 'top') dy = target.y - bounds.y
    if (direction === 'center-y') dy = target.y + target.height / 2 - bounds.y - bounds.height / 2
    if (direction === 'bottom') dy = target.y + target.height - bounds.y - bounds.height
    return { ...item, x: item.x + dx, y: item.y + dy }
  })
}

export const distributeArtwork = (items: Artwork[], target: AlignmentBounds, axis: 'x' | 'y'): Artwork[] => {
  if (items.length < 3) return items
  const size = axis === 'x' ? 'width' : 'height'
  const ordered = items.map(item => ({ item, bounds: artworkBounds(item) })).sort((a, b) => a.bounds[axis] - b.bounds[axis])
  const gap = (target[size] - ordered.reduce((total, entry) => total + entry.bounds[size], 0)) / (ordered.length - 1)
  let cursor = target[axis]
  return ordered.map(({ item, bounds }) => {
    const result = { ...item, [axis]: item[axis] + cursor - bounds[axis] }
    cursor += bounds[size] + gap
    return result
  })
}
