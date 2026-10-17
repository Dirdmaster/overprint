import { onScopeDispose } from 'vue'
import { useArtwork } from './useArtwork'
import { useComposition } from '../project/useComposition'
import { outlineText } from '../../utils/outlineText'
import { physicalText, type TextDefinition } from '../../utils/textDrawing'
export const useTextDrawing = () => {
  const artwork = useArtwork()
  const { board } = useComposition()
  let alive = true, generation = 0
  onScopeDispose(() => { alive = false; generation++ })
  const addText = async (definition: TextDefinition, side: string, x: number, y: number) => {
    if (!['front', 'back'].includes(side) || ![x, y].every(n => Number.isFinite(n) && Math.abs(n) <= 10000)) throw new Error('Invalid text placement.')
    const currentBoard = board.value, operation = ++generation
    const parentId = artwork.destination(side)
    const rendered = await outlineText(definition)
    if (!alive || currentBoard !== board.value || operation !== generation) return null
    if (!artwork.canAdd.value) throw new Error('This project already has 100 layers, folders, and graphics.')
    const id = crypto.randomUUID()
    artwork.checkpoint()
    artwork.items.value.push({ id, name: 'Text', side, x, y, rotation: 0, visible: true, parentId: artwork.items.value.some(item => item.id === parentId && item.kind && item.side === side) ? parentId : undefined, ...rendered })
    artwork.selection.value = id
    return id
  }
  const editText = async (id: string, patch: Partial<TextDefinition>) => {
    const item = artwork.items.value.find(item => item.id === id)
    if (item?.drawing?.type !== 'text') throw new Error('Select editable text.')
    const currentBoard = board.value, operation = ++generation
    const rendered = await outlineText({ ...physicalText(item), ...patch })
    if (!alive || currentBoard !== board.value || operation !== generation || artwork.items.value.find(value => value.id === id) !== item) return false
    artwork.edit(id, rendered)
    return true
  }
  return { addText, editText }
}
