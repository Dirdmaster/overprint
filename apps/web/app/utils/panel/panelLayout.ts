import type { BoardPackage } from '../boardPackage'

export const PANEL_RAIL = 5
export const MAX_PANEL_COPIES = 36
export const MAX_PANEL_PIXELS = 256_000_000
export const ROTATIONS = [0, 90, 180, 270] as const
export type Rotation = (typeof ROTATIONS)[number]
export type PanelPlacement = { source: number; x: number; y: number; rotation: Rotation }
export type PanelSourceLayout = { bounds: BoardPackage['bounds']; quantity: number }
export type PanelSettings = { columns: number; gap: number }

export const layoutPanel = (sources: PanelSourceLayout[], { columns, gap }: PanelSettings): PanelPlacement[] => {
  if (!Number.isInteger(columns) || columns < 1 || columns > MAX_PANEL_COPIES) {
    throw new Error('Choose between 1 and 36 columns.')
  }
  if (!Number.isFinite(gap) || gap < 2 || gap > 5) throw new Error('Choose a routing gap between 2 and 5 mm.')
  const quantity = sources.reduce((sum, source) => sum + source.quantity, 0)
  if (quantity < 1 || quantity > MAX_PANEL_COPIES || sources.some(s => !Number.isInteger(s.quantity) || s.quantity < 1)) {
    throw new Error('Use between 1 and 36 total copies.')
  }
  const margin = PANEL_RAIL + gap
  const placements: PanelPlacement[] = []
  let x = margin, y = margin, rowHeight = 0
  for (const [source, { bounds, quantity }] of sources.entries()) {
    for (let copy = 0; copy < quantity; copy++) {
      placements.push({ source, x: x - bounds.x, y: y - bounds.y, rotation: 0 })
      x += bounds.width + gap
      rowHeight = Math.max(rowHeight, bounds.height)
      if (placements.length % columns === 0) {
        x = margin
        y += rowHeight + gap
        rowHeight = 0
      }
    }
  }
  return placements
}

export const placedBounds = (bounds: BoardPackage['bounds'], placement: PanelPlacement) => {
  const { x, y, width, height } = bounds
  const cos = Math.round(Math.cos(placement.rotation * Math.PI / 180))
  const sin = Math.round(Math.sin(placement.rotation * Math.PI / 180))
  return {
    x: placement.x + cos * x - sin * y + Math.min(cos * width, 0) + Math.min(-sin * height, 0),
    y: placement.y + sin * x + cos * y + Math.min(sin * width, 0) + Math.min(cos * height, 0),
    width: Math.abs(cos) * width + Math.abs(sin) * height,
    height: Math.abs(sin) * width + Math.abs(cos) * height,
  }
}

export const panelBounds = (sources: PanelSourceLayout[], placements: PanelPlacement[], gap: number) => {
  const rectangles = placements.map(placement => placedBounds(sources[placement.source]!.bounds, placement))
  const margin = PANEL_RAIL + gap
  const x = Math.min(...rectangles.map(rect => rect.x)) - margin
  const y = Math.min(...rectangles.map(rect => rect.y)) - margin
  return {
    x, y,
    width: Math.max(...rectangles.map(rect => rect.x + rect.width)) + margin - x,
    height: Math.max(...rectangles.map(rect => rect.y + rect.height)) + margin - y,
  }
}

export const assertPanelSize = ({ width, height }: BoardPackage['bounds']) => {
  const scale = 1200 / 25.4
  if (Math.ceil(width * scale) * Math.ceil(height * scale) > MAX_PANEL_PIXELS) {
    throw new Error('This layout exceeds 256 megapixels at 1200 DPI. Reduce the number of copies or change the layout.')
  }
}
