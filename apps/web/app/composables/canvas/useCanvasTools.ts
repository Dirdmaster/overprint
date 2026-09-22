import { useEditorState, editorOwnsEvent, editorEventTarget } from '../editor/editorState'
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useEditorRef } from '../editor/editorState'
export const useCanvasTools = () => {
  const state = useEditorState()
  const selected = useEditorRef<'select' | 'hand' | 'paint'>('canvas-tool', () => 'select')
  const holdingSpace = useEditorRef('canvas-space', () => false)
  const holdingMiddle = useEditorRef('canvas-middle', () => false)
  const active = computed(() => holdingSpace.value || holdingMiddle.value ? 'hand' : selected.value)
  const keyDown = (event: KeyboardEvent) => {
    if (!editorOwnsEvent(state, event)) return
    const target = editorEventTarget(event)
    if ((state.globalShortcuts ? document : state.root.value)?.querySelector('dialog[open]') || target?.closest('dialog, input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.code === 'Space') {
      // Preserve Space activation on normal controls, but use it for Hand on the canvas toolbar.
      if (target?.closest('button, a, summary') && !target.closest('[aria-label="Canvas tools"]')) return
      event.preventDefault()
      holdingSpace.value = true
    } else if (['v', 'm'].includes(event.key.toLowerCase())) selected.value = 'select'
    else if (event.key.toLowerCase() === 'k') selected.value = 'paint'
  }
  const releaseSpace = (event: KeyboardEvent) => { if (event.code === 'Space') holdingSpace.value = false }
  const resetSpace = () => { holdingSpace.value = false }
  onMounted(() => {
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', releaseSpace)
    window.addEventListener('blur', resetSpace)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', keyDown)
    window.removeEventListener('keyup', releaseSpace)
    window.removeEventListener('blur', resetSpace)
  })
  return { selected, active, holdingMiddle }
}
