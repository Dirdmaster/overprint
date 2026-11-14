import { useEditorState, editorOwnsEvent, editorEventTarget, type EditorState } from '../editor/editorState'
import { onMounted, onBeforeUnmount } from 'vue'
import { shortcutTool } from '../../utils/canvasTools'
import { useCanvasToolState } from './useCanvasToolState'
// Canvas, toolbar and independent parts share one listener per editor session.
const subscriptions = new WeakMap<EditorState, { count: number; remove: () => void }>()
export const useCanvasTools = () => {
  const state = useEditorState()
  const { selected, holdingSpace, holdingMiddle, active } = useCanvasToolState()
  onMounted(() => {
    const existing = subscriptions.get(state)
    if (existing) { existing.count++; return }
    const keyDown = (event: KeyboardEvent) => {
      if (!editorOwnsEvent(state, event)) return
      const target = editorEventTarget(event)
      if ((state.globalShortcuts ? document : state.root.value)?.querySelector('dialog[open]') || target?.closest('dialog, input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="combobox"], [role="listbox"]')) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.code === 'Space') {
        if (target?.closest('button, a, summary') && !target.closest('[aria-label="Canvas tools"]')) return
        event.preventDefault(); holdingSpace.value = true
      } else if (event.key === 'Escape' && !['pen', 'paint'].includes(selected.value)) {
        selected.value = 'select'
      } else {
        const tool = shortcutTool(event.key)
        if (tool) { event.preventDefault(); selected.value = tool; state.root.value?.focus({ preventScroll: true }) }
      }
    }
    const release = (event: KeyboardEvent) => { if (event.code === 'Space') holdingSpace.value = false }
    const reset = () => { holdingSpace.value = false }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', release)
    window.addEventListener('blur', reset)
    subscriptions.set(state, { count: 1, remove: () => {
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', release); window.removeEventListener('blur', reset); reset()
    } })
  })
  onBeforeUnmount(() => {
    const shared = subscriptions.get(state)
    if (shared && --shared.count === 0) { shared.remove(); subscriptions.delete(state) }
  })
  return { selected, active, holdingMiddle }
}
