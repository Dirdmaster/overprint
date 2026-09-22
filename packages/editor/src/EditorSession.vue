<script setup lang="ts">
import { provide, onBeforeUnmount, ref, watch } from 'vue'
import BoardEditor from '../../../apps/web/app/components/editor/BoardEditor.vue'
import CanvasTools from '../../../apps/web/app/components/editor/CanvasTools.vue'
import BoardLayers from '../../../apps/web/app/components/editor/BoardLayers.vue'
import BoardProperties from '../../../apps/web/app/components/board/BoardProperties.vue'
import BoardViewControls from '../../../apps/web/app/components/board/BoardViewControls.vue'
import BoardZoomControls from '../../../apps/web/app/components/board/BoardZoomControls.vue'
import LivePaintControls from '../../../apps/web/app/components/paint/LivePaintControls.vue'
import { editorStateKey } from '../../../apps/web/app/composables/editor/editorState'
import { editorSession, type EditorController } from './controller'
import type { EditorPart } from './parts'

const props = defineProps<{ controller: EditorController; kind: EditorPart }>()
const session = editorSession(props.controller)
const isCanvas = props.kind === 'editor' || props.kind === 'canvas'
if (isCanvas && session.mounted)
  throw new Error(
    'A controller supports one canvas. Create another controller for a second canvas.',
  )
if (isCanvas) session.mounted = true
provide(editorStateKey, session.state)
const { board, side, silk, maskColor, components } = session.composition
const { modelView, zoom } = session.view
const alive = session.alive
const root = ref<HTMLElement | null>(null)
const picker = ref<HTMLInputElement | null>(null)
const error = ref('')
watch(
  root,
  (next, previous) => {
    if (previous) session.state.roots.delete(previous)
    if (next) session.state.roots.add(next)
  },
  { flush: 'post' },
)
onBeforeUnmount(() => {
  if (isCanvas) session.mounted = false
  if (root.value) session.state.roots.delete(root.value)
})
const importGraphic = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    await props.controller.addGraphic(file)
    error.value = ''
  } catch (value) {
    error.value =
      value instanceof Error ? value.message : 'Unable to import graphic'
  } finally {
    input.value = ''
  }
}
const removeModels = () => {
  if (board.value) board.value = { ...board.value, models: undefined }
  modelView.value = false
}
</script>
<template>
  <div
    v-if="alive && board"
    ref="root"
    :class="isCanvas ? 'embedded-editor canvas-grid' : 'editor-control'"
    :part="isCanvas ? 'surface' : 'panel'"
    tabindex="0"
  >
    <template v-if="isCanvas">
      <BoardEditor :board="board" :canvas-only="kind === 'canvas'" />
      <footer part="attribution" class="embedded-attribution">
        <a
          href="https://overprint.ink"
          target="_blank"
          rel="noopener noreferrer"
          >Powered by Overprint</a
        >
      </footer>
    </template>
    <CanvasTools v-else-if="kind === 'toolbar'" />
    <LivePaintControls v-else-if="kind === 'palette'" part="palette" />
    <template v-else-if="kind === 'layers'">
      <BoardLayers
        :board="board"
        :side="side"
        v-model:silk="silk"
        v-model:fabrication="components"
        @import-graphic="picker?.click()"
      />
      <input
        ref="picker"
        class="hidden"
        type="file"
        accept=".svg,image/svg+xml"
        aria-label="Choose SVG graphic"
        @change="importGraphic"
      />
    </template>
    <BoardProperties
      v-else-if="kind === 'properties'"
      part="properties"
      :board="board"
      v-model:mask="maskColor"
    />
    <div v-else-if="kind === 'view-controls'" part="view-controls">
      <BoardViewControls
        :models="board.models"
        v-model:model-view="modelView"
        v-model:side="side"
        @remove-models="removeModels"
      />
    </div>
    <BoardZoomControls
      v-else-if="kind === 'zoom-controls'"
      part="zoom-controls"
      :zoom="zoom"
      :model-view="modelView"
      @fit="controller.fit()"
      @zoom="controller.zoomBy($event)"
    />
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<style>
:host {
  display: block;
  font-family: var(--overprint-font-family, Inter, sans-serif);
  color: var(--ink);
}
.embedded-editor {
  display: flex;
  flex-direction: column;
  height: var(--overprint-height, 44rem);
  min-height: 32rem;
  background-color: var(--canvas);
}
.editor-control {
  background-color: var(--surface);
}
.embedded-attribution {
  display: flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0 1rem;
  font-size: 0.75rem;
  color: var(--muted);
}
.embedded-attribution a {
  color: inherit;
}
</style>
