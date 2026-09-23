import { useArtwork } from './useArtwork'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { Artwork } from '../../utils/artwork'

type LayerDrop = { id: string | null; position: 'before' | 'after' | 'inside' }

export const useLayerDrag = () => {
  const { items, descendants, moveLayer } = useArtwork()
  const dragging = ref<string | null>(null)
  const dropTarget = ref<LayerDrop | null>(null)
  const clear = () => { dragging.value = null; dropTarget.value = null }
  const start = (event: DragEvent, item: Artwork) => {
    if (!event.dataTransfer) return
    dragging.value = item.id
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-overprint-layer', item.id)
  }
  const over = (event: DragEvent, target?: Artwork) => {
    if (!dragging.value) return
    event.stopPropagation()
    dropTarget.value = null
    const source = items.value.find(item => item.id === dragging.value)
    if (!source || (target && (target.id === source.id || target.side !== source.side || descendants(source.id).includes(target.id)))) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (!target) { dropTarget.value = { id: null, position: 'after' }; return }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const fraction = (event.clientY - rect.top) / rect.height
    const position = target.kind && fraction >= 0.25 && fraction <= 0.75 ? 'inside' : fraction < 0.5 ? 'before' : 'after'
    dropTarget.value = { id: target.id, position }
  }
  const drop = (event: DragEvent) => {
    if (!dragging.value) return
    event.preventDefault(); event.stopPropagation()
    if (dropTarget.value) moveLayer(dragging.value, dropTarget.value.id, dropTarget.value.position)
    clear()
  }
  const leave = (event: DragEvent) => {
    const row = event.currentTarget as HTMLElement
    if (dropTarget.value?.id !== (row.dataset.layerRow ?? null)) return
    if (!row.contains(event.relatedTarget as Node | null)) dropTarget.value = null
  }
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') clear() }
  onMounted(() => { window.addEventListener('keydown', key); window.addEventListener('blur', clear) })
  onBeforeUnmount(() => { window.removeEventListener('keydown', key); window.removeEventListener('blur', clear) })
  return { dragging, dropTarget, start, over, drop, clear, leave }
}
