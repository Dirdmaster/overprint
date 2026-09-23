import { useEditorRef, useEditorState } from '../editor/editorState'

export const useCanvasView = () => {
  const state = useEditorState()
  const modelView = useEditorRef('canvas-model-view', () => false)
  const zoom = useEditorRef('canvas-zoom', () => 1)
  const pan = useEditorRef('canvas-pan', () => ({ x: 0, y: 0 }))
  const fit = () => state.viewport.value?.fit()
  const zoomBy = (factor: number) => state.viewport.value?.zoomBy(factor)
  return { modelView, zoom, pan, fit, zoomBy }
}
