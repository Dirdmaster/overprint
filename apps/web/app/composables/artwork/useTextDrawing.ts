import { onScopeDispose, ref, shallowRef } from 'vue'
import { useArtwork } from './useArtwork'
import { useComposition } from '../project/useComposition'
import { outlineText } from '../../utils/outlineText'
import { physicalText, type TextDefinition } from '../../utils/textDrawing'
export const useTextDrawing = () => {
  const artwork = useArtwork()
  const { board } = useComposition()
  const committing = ref(false)
  const committedItem = shallowRef<typeof artwork.items.value[number]>()
  let lastEdit: { item: typeof artwork.items.value[number]; history: typeof artwork.past.value; group: object; time: number } | undefined
  let alive = true, generation = 0
  const cancelEdit = () => { generation++; lastEdit = undefined; committedItem.value = undefined }
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
  const editText = async (id: string, patch: Partial<TextDefinition>, group?: object) => {
    const item = artwork.items.value.find(item => item.id === id)
    if (item?.drawing?.type !== 'text') throw new Error('Select editable text.')
    if (!artwork.canPatch(id, { source: item.source })) return false
    const currentBoard = board.value, operation = ++generation
    const rendered = await outlineText({ ...physicalText(item), ...patch })
    if (!alive || currentBoard !== board.value || operation !== generation || artwork.items.value.find(value => value.id === id) !== item || !artwork.canPatch(id, { source: rendered.source })) return false
    if (item.source === rendered.source && JSON.stringify(item.drawing) === JSON.stringify(rendered.drawing)) return true
    const now = Date.now()
    const merge = group && lastEdit?.group === group && lastEdit.item === item && lastEdit.history === artwork.past.value && !artwork.future.value.length && now - lastEdit.time < 1000
    committing.value = true
    try {
      if (!merge) artwork.checkpoint()
      artwork.patchItems([{ id, patch: rendered }])
      committedItem.value = artwork.items.value.find(value => value.id === id)
      lastEdit = group ? { item: artwork.items.value.find(value => value.id === id)!, history: artwork.past.value, group, time: now } : undefined
    } finally { committing.value = false }
    return true
  }
  return { addText, editText, cancelEdit, committing, committedItem }
}
