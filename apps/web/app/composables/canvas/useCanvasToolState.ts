import type { CanvasTool } from '../../utils/drawing'
import { computed } from 'vue'
import { useEditorRef } from '../editor/editorState'

export const useCanvasToolState = () => {
  const selected = useEditorRef<CanvasTool>('canvas-tool', () => 'select')
  const holdingSpace = useEditorRef('canvas-space', () => false)
  const holdingMiddle = useEditorRef('canvas-middle', () => false)
  const active = computed(() => holdingSpace.value || holdingMiddle.value ? 'hand' : selected.value)
  return { selected, holdingSpace, holdingMiddle, active }
}
