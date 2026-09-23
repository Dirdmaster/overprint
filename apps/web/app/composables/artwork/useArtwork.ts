import { computed } from 'vue'
import { useEditorRef } from '../editor/editorState'
import { artworkCount, artworkRows, MAX_ARTWORK_ITEMS, type Artwork } from '../../utils/artwork'
import { isNativeSilk } from '../../utils/nativeSilk'
export const useArtwork = () => {
  const items = useEditorRef<Artwork[]>('artwork', () => [])
  const canAdd = computed(() => artworkCount(items.value) < MAX_ARTWORK_ITEMS)
  const selected = useEditorRef<string[]>('artwork-selected-ids', () => [])
  const visibleGraphics = computed(() => ['front', 'back'].flatMap(side => artworkRows(items.value, side, true).filter(row => row.visible && !row.item.kind).map(row => row.item)))
  const selectionIds = computed(() => selected.value.filter(id => isNativeSilk(id) || items.value.some(item => item.id === id && (selected.value.length === 1 || visibleGraphics.value.some(graphic => graphic.id === id)))))
  // Existing single-object tools use the last selected graphic as their active target.
  const selection = computed({ get: () => selectionIds.value.at(-1) ?? null, set: (id: string | null) => { selected.value = id ? [id] : [] } })
  const selectedArtwork = computed(() => visibleGraphics.value.filter(item => selectionIds.value.includes(item.id)))
  const select = (id: string, additive = false) => {
    const item = visibleGraphics.value.find(item => item.id === id)
    if (!additive || !item) { selection.value = id; return }
    const ids = selectedArtwork.value.filter(value => value.side === item.side).map(value => value.id)
    selected.value = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]
  }
  const past = useEditorRef<Artwork[][]>('artwork-past', () => [])
  const future = useEditorRef<Artwork[][]>('artwork-future', () => [])
  const copy = (value: Artwork[]) => value.map(item => ({ ...item }))
  const checkpoint = () => { past.value = [...past.value.slice(-49), copy(items.value)]; future.value = [] }
  const undo = () => { const previous = past.value.at(-1); if (!previous) return; future.value.push(copy(items.value)); items.value = previous; past.value.pop() }
  const redo = () => { const next = future.value.at(-1); if (!next) return; past.value.push(copy(items.value)); items.value = next; future.value.pop() }
  const edit = (id: string, patch: Partial<Artwork>) => { checkpoint(); items.value = items.value.map(item => item.id === id ? { ...item, ...patch } : item) }
  const descendants = (id: string): string[] => items.value.filter(item => item.parentId === id).flatMap(item => [item.id, ...descendants(item.id)])
  const removeIds = (values: string[]) => {
    const ids = new Set(values.filter(id => !isNativeSilk(id)).flatMap(id => [id, ...descendants(id)]))
    if (!ids.size) return
    checkpoint(); items.value = items.value.filter(item => !ids.has(item.id)); selection.value = null
  }
  const remove = (id: string) => removeIds([id])
  const removeSelected = () => removeIds(selectionIds.value)
  const applyPositions = (changes: Pick<Artwork, 'id' | 'x' | 'y'>[]) => {
    const byId = new Map(changes.map(item => [item.id, item]))
    if (!items.value.some(item => { const next = byId.get(item.id); return next && (Math.abs(next.x - item.x) > 1e-9 || Math.abs(next.y - item.y) > 1e-9) })) return
    if (changes.some(item => !Number.isFinite(item.x) || !Number.isFinite(item.y) || Math.abs(item.x) > 10000 || Math.abs(item.y) > 10000)) return
    checkpoint()
    items.value = items.value.map(item => { const next = byId.get(item.id); return next ? { ...item, x: next.x, y: next.y } : item })
  }
  const destination = (side: string) => {
    const current = items.value.find(item => !item.nativeSilk && item.id === selection.value && item.side === side)
    return current?.kind ? current.id : current?.parentId
  }
  const create = (kind: 'layer' | 'folder', side: string) => {
    if (!canAdd.value) return
    checkpoint()
    const item: Artwork = { id: crypto.randomUUID(), name: `${kind === 'layer' ? 'Layer' : 'Folder'} ${items.value.filter(item => !item.nativeSilk && item.kind === kind).length + 1}`, kind, side, parentId: destination(side), source: '', visible: true, x: 0, y: 0, width: 1, height: 1, rotation: 0 }
    items.value.push(item); selection.value = item.id
  }
  const reparent = (id: string, parentId?: string) => {
    const item = items.value.find(item => item.id === id)
    const parent = items.value.find(item => item.id === parentId)
    if (!item || item.nativeSilk || parent?.nativeSilk || id === parentId || descendants(id).includes(parentId ?? '') || (parentId && (!parent?.kind || parent.side !== item.side))) return
    edit(id, { parentId })
  }
  const reorder = (id: string, offset: number) => {
    const index = items.value.findIndex(item => item.id === id)
    if (index < 0 || items.value[index]?.nativeSilk) return
    let target = index + offset
    while (target >= 0 && target < items.value.length && (items.value[target]!.nativeSilk || items.value[target]!.side !== items.value[index]!.side || items.value[target]!.parentId !== items.value[index]!.parentId)) target += offset
    if (target < 0 || target >= items.value.length) return
    checkpoint(); const next = [...items.value]; [next[index], next[target]] = [next[target]!, next[index]!]; items.value = next
  }
  // Panel order is the reverse of paint order. Children follow their parent via artworkRows.
  const moveLayer = (id: string, targetId: string | null, position: 'before' | 'after' | 'inside') => {
    const item = items.value.find(item => item.id === id)
    const target = items.value.find(item => item.id === targetId)
    if (!item || item.nativeSilk || target?.nativeSilk || id === targetId || descendants(id).includes(targetId ?? '')) return
    if (targetId && (!target || target.side !== item.side || (position === 'inside' && !target.kind))) return
    const parentId = position === 'inside' ? target?.id : target?.parentId
    const next = items.value.filter(item => item.id !== id)
    const index = !target ? 0 : position === 'inside' ? next.length : next.indexOf(target) + (position === 'before' ? 1 : 0)
    next.splice(index, 0, item.parentId === parentId ? item : { ...item, parentId })
    if (next.every((item, index) => item === items.value[index])) return
    checkpoint()
    items.value = next.map(item => position === 'inside' && item.id === targetId ? { ...item, collapsed: false } : item)
    selection.value = id
  }
  const reset = () => { items.value = []; past.value = []; future.value = []; selection.value = null }
  return { items, canAdd, selection, selectionIds, selectedArtwork, select, applyPositions, removeSelected, past, future, checkpoint, undo, redo, edit, remove, reorder, moveLayer, reset, create, destination, descendants, reparent }
}
