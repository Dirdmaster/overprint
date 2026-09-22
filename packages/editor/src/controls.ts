import { watch } from 'vue'
import type { editorSession } from './controller'
import { normalizeHex } from '../../../apps/web/app/utils/paintColor'

export type EditorTool = 'select' | 'hand' | 'paint'
export type EditorViewState = {
  tool: EditorTool
  activeTool: EditorTool
  side: 'front' | 'back'
  view: '2d' | '3d'
  zoom: number
  paintColor: string
  maskColor: string
  silk: boolean
  fabrication: boolean
  canUndo: boolean
  canRedo: boolean
  selection: string[]
  layers: {
    id: string
    name: string
    kind: 'graphic' | 'layer' | 'folder'
    side: string
    visible: boolean
    parentId?: string
  }[]
}
export interface EditorControls {
  getState(): EditorViewState
  subscribeState(listener: (state: EditorViewState) => void): () => void
  setTool(tool: EditorTool): void
  setView(view: '2d' | '3d'): void
  setPaintColor(color: string): void
  setMaskColor(color: string): void
  setVisibility(layer: 'silkscreen' | 'fabrication', visible: boolean): void
  fit(): void
  zoomBy(factor: number): void
  createLayer(kind: 'layer' | 'folder'): string
  selectLayer(id: string | null): void
  renameLayer(id: string, name: string): void
  setLayerVisibility(id: string, visible: boolean): void
  removeLayer(id: string): void
}
export const createControls = (
  session: ReturnType<typeof editorSession>,
): EditorControls => {
  const { artwork, composition, view, paint, tools } = session
  const live = () => {
    if (!session.alive.value) throw new Error('This editor has been disposed.')
  }
  const layer = (id: string) => {
    live()
    const item = artwork.items.value.find((item) => item.id === id)
    if (!item || item.nativeSilk) throw new Error('Unknown editable layer.')
    return item
  }
  const color = (value: string) => {
    live()
    const next = normalizeHex(value)
    if (!next)
      throw new Error('Invalid color. Use a three or six digit hex color.')
    return next
  }
  const getState = (): EditorViewState => {
    live()
    return {
      tool: tools.selected.value,
      activeTool: tools.active.value,
      side: composition.side.value as 'front' | 'back',
      view: view.modelView.value ? '3d' : '2d',
      zoom: view.zoom.value,
      paintColor: paint.color.value,
      maskColor: composition.maskColor.value,
      silk: composition.silk.value,
      fabrication: composition.components.value,
      canUndo: !!artwork.past.value.length,
      canRedo: !!artwork.future.value.length,
      selection: [...artwork.selectionIds.value],
      layers: artwork.items.value
        .filter((item) => !item.nativeSilk)
        .map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind || 'graphic',
          side: item.side,
          visible: item.visible,
          parentId: item.parentId,
        })),
    }
  }
  return {
    getState,
    subscribeState(listener) {
      live()
      return session.scope.run(() => watch(getState, listener, { deep: true }))!
    },
    setTool(value) {
      live()
      if (!['select', 'hand', 'paint'].includes(value))
        throw new Error('Invalid tool.')
      tools.selected.value = value
    },
    setView(value) {
      live()
      if (!['2d', '3d'].includes(value)) throw new Error('Invalid view.')
      if (value === '3d' && !composition.board.value?.models?.glb)
        throw new Error('This board has no 3D models.')
      view.modelView.value = value === '3d'
    },
    setPaintColor(value) {
      paint.color.value = color(value)
    },
    setMaskColor(value) {
      composition.maskColor.value = color(value)
    },
    setVisibility(name, visible) {
      live()
      if (
        typeof visible !== 'boolean' ||
        !['silkscreen', 'fabrication'].includes(name)
      )
        throw new Error('Invalid layer visibility.')
      if (name === 'silkscreen') composition.silk.value = visible
      else composition.components.value = visible
    },
    fit() {
      live()
      view.fit()
    },
    zoomBy(factor) {
      live()
      if (!Number.isFinite(factor) || factor <= 0)
        throw new Error('Zoom factor must be positive.')
      view.zoomBy(factor)
    },
    createLayer(kind) {
      live()
      if (!['layer', 'folder'].includes(kind))
        throw new Error('Invalid layer kind.')
      if (!artwork.canAdd.value)
        throw new Error(
          'This project already has 100 layers, folders, and graphics.',
        )
      artwork.create(kind, composition.side.value)
      return artwork.selection.value!
    },
    selectLayer(id) {
      live()
      if (id !== null) layer(id)
      artwork.selection.value = id
    },
    renameLayer(id, name) {
      layer(id)
      if (!name.trim() || name.length > 200)
        throw new Error('Layer names must contain 1 to 200 characters.')
      artwork.edit(id, { name })
    },
    setLayerVisibility(id, visible) {
      layer(id)
      if (typeof visible !== 'boolean')
        throw new Error('Invalid layer visibility.')
      artwork.edit(id, { visible })
    },
    removeLayer(id) {
      layer(id)
      artwork.remove(id)
    },
  }
}
