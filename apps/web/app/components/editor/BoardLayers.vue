<script setup lang="ts">
import { computed, watch } from 'vue'
import { useEditorRef } from '../../composables/editor/editorState'
import { useCanvasView } from '../../composables/canvas/useCanvasView'
import { useComposition } from '../../composables/project/useComposition'
import { useLayerDrag } from '../../composables/artwork/useLayerDrag'
import { nativeSilkId } from '../../utils/nativeSilk'
import { useArtwork } from '../../composables/artwork/useArtwork'
import ArtworkLayers from '../artwork/ArtworkLayers.vue'
import KicadLayers from '../kicad/KicadLayers.vue'
import { Plus, FolderPlus, ImagePlus, ChevronDown, ChevronRight, Square } from '@lucide/vue'
import type { BoardPackage } from '../../utils/boardPackage'
const props = withDefaults(
  defineProps<{
    board: BoardPackage
    side: string
    showImport?: boolean
    showNativeLayers?: boolean
    showHistory?: boolean
  }>(),
  { showImport: true, showNativeLayers: true, showHistory: true }
)
const { create, canAdd, items, selection, moveToSide, canMoveToSide } = useArtwork()
const { side: activeSide } = useComposition()
const { showBoth, modelView, fit } = useCanvasView()
const { dragging, clear } = useLayerDrag()
const open = useEditorRef<Record<string, boolean>>('artboard-layer-sections', () => ({
  front: true,
  back: true
}))
const dropping = useEditorRef<string | null>('artboard-layer-drop', () => null)
const artboards = computed(() =>
  ['front', 'back'].map((side) => ({
    side,
    label: side === 'front' ? 'Front' : 'Back',
    count: items.value.filter((item) => item.side === side && !item.nativeSilk).length
  }))
)
const activate = (side: string) => {
  activeSide.value = side
  open.value[side] = true
}
const selectedArtboardSide = computed(
  () =>
    items.value.find((item) => item.id === selection.value)?.side ??
    ['front', 'back'].find((side) => nativeSilkId(side) === selection.value)
)
watch([selection, selectedArtboardSide], ([id, side]) => {
  if (side) {
    open.value[side] = true
    if (activeSide.value !== side) {
      activeSide.value = side
      selection.value = id
    }
  }
})
const canDrop = (side: string) => !!dragging.value && canMoveToSide(dragging.value, side)
const dragOver = (event: DragEvent, side: string) => {
  if (!canDrop(side)) return
  event.preventDefault()
  event.stopPropagation()
  dropping.value = side
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}
const leaveArtboard = (event: DragEvent) => {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
    dropping.value = null
}
const dropArtboard = (event: DragEvent, side: string) => {
  event.preventDefault()
  event.stopPropagation()
  const id = dragging.value
  if (id && canDrop(side) && moveToSide(id, side)) {
    activate(side)
    selection.value = id
  }
  dropping.value = null
  clear()
}
const focusArtboard = (side: string) => {
  activate(side)
  modelView.value = false
  showBoth.value = false
  fit()
}
const addLayer = (kind: 'layer' | 'folder') => {
  activate(activeSide.value)
  create(kind, activeSide.value)
}
defineEmits<{ importGraphic: [] }>()
const silk = defineModel<boolean>('silk', { required: true })
const fabrication = defineModel<boolean>('fabrication', { required: true })
const layerActions = [
  { kind: 'layer', label: 'Add layer', icon: Plus },
  { kind: 'folder', label: 'Add folder', icon: FolderPlus }
] as const
</script>
<template>
  <section
    part="layers"
    class="border-b border-line pb-6"
  >
    <header class="flex h-12 items-center justify-between border-b border-line px-4">
      <h2 class="font-medium">Layers</h2>
      <div class="flex items-center text-muted">
        <button
          v-for="action in layerActions"
          :key="action.kind"
          :title="action.label"
          :aria-label="action.label"
          :disabled="!canAdd"
          class="flex size-7 items-center justify-center rounded hover:bg-soft disabled:opacity-45"
          @click="addLayer(action.kind)"
        >
          <component
            :is="action.icon"
            class="size-4.5"
          />
        </button>
        <button
          v-if="showImport"
          title="Import graphic"
          aria-label="Import graphic"
          class="flex size-7 items-center justify-center rounded hover:bg-soft"
          @click="$emit('importGraphic')"
        >
          <ImagePlus class="size-4.5" />
        </button>
      </div>
    </header>
    <section
      v-for="artboard in artboards"
      :key="artboard.side"
      :aria-label="`${artboard.label} artboard layers`"
      :data-artboard-layers="artboard.side"
      class="border-b border-line"
    >
      <header
        @dragover="dragOver($event, artboard.side)"
        @drop="dropArtboard($event, artboard.side)"
        @dragleave="leaveArtboard"
        class="flex items-center gap-2 px-3 py-2"
        :class="[
          activeSide === artboard.side ? 'bg-soft' : '',
          dropping === artboard.side && dragging ? 'ring-2 ring-inset ring-accent' : ''
        ]"
      >
        <button
          class="flex size-6 items-center justify-center rounded text-muted hover:bg-surface"
          :aria-label="`${open[artboard.side] ? 'Collapse' : 'Expand'} ${artboard.label} artboard`"
          :aria-expanded="open[artboard.side]"
          @click="open[artboard.side] = !open[artboard.side]"
        >
          <component
            :is="open[artboard.side] ? ChevronDown : ChevronRight"
            class="size-3.5"
          />
        </button>
        <Square class="size-4 text-muted" />
        <button
          class="min-w-0 flex-1 py-1 text-left font-medium"
          :aria-label="`Activate ${artboard.label} artboard`"
          :aria-pressed="activeSide === artboard.side"
          @click="activate(artboard.side)"
          @dblclick="focusArtboard(artboard.side)"
          title="Double-click to fit artboard"
        >
          {{ artboard.label }}
        </button>
        <span
          class="text-muted tabular-nums"
          :aria-label="`${artboard.count} artwork items`"
        >
          {{ artboard.count }}
        </span>
      </header>
      <div v-if="open[artboard.side]">
        <ArtworkLayers
          :side="artboard.side"
          :bounds="board.bounds"
          :show-properties="false"
        />
        <KicadLayers
          v-if="showNativeLayers"
          :side="artboard.side"
          variant="artboard"
          v-model:silk="silk"
          v-model:fabrication="fabrication"
        />
      </div>
    </section>
    <ArtworkLayers
      :side="activeSide"
      :bounds="board.bounds"
      :show-rows="false"
      :show-history="showHistory"
    />
    <KicadLayers
      v-if="showNativeLayers"
      :side="activeSide"
      variant="reference"
      v-model:silk="silk"
      v-model:fabrication="fabrication"
    />
  </section>
</template>
