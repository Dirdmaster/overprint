import { validateText, type TextDefinition } from './textDrawing'
import type { Artwork } from './artwork'
export const shapeTools = ['rectangle', 'roundedRectangle', 'ellipse', 'line'] as const
export type ShapeTool = typeof shapeTools[number]
export type CanvasTool = 'select' | 'hand' | 'paint' | 'text' | ShapeTool
export type ShapeDefinition = {
  type: 'shape'; shape: ShapeTool; width: number; height: number
  radius: number; fill: string; stroke: string; strokeWidth: number; lineReverse: boolean
}
export type DrawingDefinition = ShapeDefinition | TextDefinition
export const shapeNames: Record<ShapeTool, string> = { rectangle: 'Rectangle', roundedRectangle: 'Rounded rectangle', ellipse: 'Ellipse', line: 'Line' }
export const isShapeTool = (value: string): value is ShapeTool => (shapeTools as readonly string[]).includes(value)
export const validateDrawing = (value: unknown): DrawingDefinition => {
  if ((value as DrawingDefinition)?.type === 'text') return validateText(value)
  return validateShape(value)
}
export const validateShape = (value: unknown): ShapeDefinition => {
  const d = value as ShapeDefinition
  const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 9990
  const color = (c: unknown) => typeof c === 'string' && /^(none|#[\da-f]{6})$/i.test(c)
  if (!d || d.type !== 'shape' || !isShapeTool(d.shape) || !number(d.width) || !number(d.height) || !number(d.radius) || !number(d.strokeWidth) || d.strokeWidth > 100 || !color(d.fill) || !color(d.stroke) || typeof d.lineReverse !== 'boolean' || (d.shape !== 'line' && (d.width < .01 || d.height < .01)) || (d.shape === 'line' && (d.width === 0 && d.height === 0 || d.stroke === 'none' || d.strokeWidth < .01)) || d.radius > Math.min(d.width, d.height) / 2) throw new Error('Invalid editable shape.')
  return { type: 'shape', shape: d.shape, width: d.width, height: d.height, radius: d.radius, fill: d.fill, stroke: d.stroke, strokeWidth: d.strokeWidth, lineReverse: d.lineReverse }
}
// Frozen self-contained SVG is the single rendering source, including stroke extents.
export const renderDrawing = (value: ShapeDefinition) => {
  const d = validateShape(value)
  const stroke = d.stroke === 'none' ? 0 : d.strokeWidth
  const width = Math.max(.01, d.width + stroke), height = Math.max(.01, d.height + stroke)
  const p = stroke / 2
  const style = `fill="${d.shape === 'line' ? 'none' : d.fill}" stroke="${d.stroke}" stroke-width="${d.strokeWidth}"`
  const geometry = d.shape === 'line'
    ? `<line x1="${p}" y1="${p + (d.lineReverse ? d.height : 0)}" x2="${p + d.width}" y2="${p + (d.lineReverse ? 0 : d.height)}" stroke-linecap="round" ${style}/>`
    : d.shape === 'ellipse'
      ? `<ellipse cx="${p + d.width / 2}" cy="${p + d.height / 2}" rx="${d.width / 2}" ry="${d.height / 2}" ${style}/>`
      : `<rect x="${p}" y="${p}" width="${d.width}" height="${d.height}" rx="${d.shape === 'roundedRectangle' ? d.radius : 0}" ${style}/>`
  return { width, height, source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${geometry}</svg>`, drawing: d }
}
export const defaultShape = (shape: ShapeTool, width = 10, height = 10): ShapeDefinition => ({ type: 'shape', shape, width, height, radius: shape === 'roundedRectangle' ? Math.min(1, width / 2, height / 2) : 0, fill: shape === 'line' ? 'none' : '#ffd426', stroke: shape === 'line' ? '#ffd426' : 'none', strokeWidth: .3, lineReverse: false })
// Uniform object scaling also scales editable physical dimensions and stroke.
export const physicalDrawing = (item: Artwork): ShapeDefinition => {
  const d = validateShape(item.drawing), rendered = renderDrawing(d)
  const ratio = item.width / rendered.width
  return { ...d, width: d.width * ratio, height: d.height * ratio, radius: d.radius * ratio, strokeWidth: d.strokeWidth * ratio }
}
