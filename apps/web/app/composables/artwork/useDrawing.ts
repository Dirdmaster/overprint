import { useArtwork } from './useArtwork'
import { renderDrawing, physicalDrawing, shapeNames, type ShapeDefinition } from '../../utils/drawing'
export const useDrawing = () => {
  const artwork = useArtwork()
  const addShape = (drawing: ShapeDefinition, side: string, x: number, y: number) => {
    if (!['front', 'back'].includes(side) || ![x, y].every(n => Number.isFinite(n) && Math.abs(n) <= 10000)) throw new Error('Invalid shape placement.')
    if (!artwork.canAdd.value) throw new Error('This project already has 100 layers, folders, and graphics.')
    const rendered = renderDrawing(drawing)
    const id = crypto.randomUUID()
    artwork.checkpoint()
    artwork.items.value.push({ id, name: shapeNames[drawing.shape], side, x, y, rotation: 0, visible: true, parentId: artwork.destination(side), ...rendered })
    artwork.selection.value = id
    return id
  }
  const editShape = (id: string, patch: Partial<ShapeDefinition>) => {
    const item = artwork.items.value.find(item => item.id === id)
    if (!item?.drawing) throw new Error('Select an editable shape.')
    const next = { ...physicalDrawing(item), ...patch }
    next.radius = Math.min(next.radius, next.width / 2, next.height / 2)
    artwork.edit(id, renderDrawing(next))
  }
  const convertToSvg = (id: string) => {
    if (artwork.items.value.some(item => item.id === id && item.drawing)) artwork.edit(id, { drawing: undefined })
  }
  return { addShape, editShape, convertToSvg }
}
