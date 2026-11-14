<script setup lang="ts">
import { watch, nextTick, useTemplateRef, useId } from 'vue'
import { Layers, Palette, LayoutGrid, CircuitBoard } from '@lucide/vue'
import { useEditorRef } from '../../composables/editor/editorState'
import EditorHistory from './EditorHistory.vue'
type InspectorPanel = 'layers' | 'color' | 'layout' | 'board'
const panel = useEditorRef<InspectorPanel>('inspector-panel', () => 'layers')
const panelId = useId()
const tabs = [
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'layout', label: 'Layout', icon: LayoutGrid },
  { id: 'board', label: 'Board', icon: CircuitBoard }
] as const
const content = useTemplateRef('content')
const choosePanel = (value: InspectorPanel) => {
  panel.value = value
  nextTick(() => content.value?.scrollTo({ top: 0 }))
}
const navigatePanels = (event: KeyboardEvent) => {
  const index = tabs.findIndex((tab) => tab.id === panel.value)
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  event.stopPropagation()
  choosePanel(tabs[next]!.id)
  const list = event.currentTarget as HTMLElement
  list.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
}
import LivePaintControls from '../paint/LivePaintControls.vue'
import { useCanvasToolState } from '../../composables/canvas/useCanvasToolState'
const { active } = useCanvasToolState()
watch(active, (value) => {
  if (value === 'paint')
    nextTick(() => {
      content.value?.scrollTo({ top: 0 })
    })
})
import LibraryPanel from '../library/LibraryPanel.vue'
import SmartPlacement from '../artwork/SmartPlacement.vue'
import PrintReviewPanel from '../artwork/PrintReviewPanel.vue'
import BoardRefreshReview from '../board/BoardRefreshReview.vue'
import ArtworkPalette from '../artwork/ArtworkPalette.vue'
import BoardLayers from './BoardLayers.vue'
import BoardProperties from '../board/BoardProperties.vue'
import type { EditorPresentation } from '../../utils/editorPresentation'
import type { BoardPackage } from '../../utils/boardPackage'
withDefaults(
  defineProps<{
    board: BoardPackage
    side: string
    ui?: EditorPresentation
    paintControls?: boolean
  }>(),
  {
    ui: () => ({}),
    paintControls: true
  }
)
defineEmits<{ importGraphic: [] }>()
const silk = defineModel<boolean>('silk', { required: true })
const fabrication = defineModel<boolean>('fabrication', { required: true })
const mask = defineModel<string>('mask', { required: true })
</script>
<template>
  <aside
    class="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-surface text-xs shadow-lg md:max-h-full md:w-76 md:self-start"
    aria-label="Board properties"
  >
    <header class="shrink-0 border-b border-line"><slot name="header" /></header>
    <div
      class="grid shrink-0 grid-cols-4 border-b border-line p-1"
      role="tablist"
      aria-label="Inspector panels"
      @keydown="navigatePanels"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :id="`${panelId}-${tab.id}-tab`"
        role="tab"
        :aria-selected="panel === tab.id"
        :aria-controls="`${panelId}-${tab.id}-panel`"
        :tabindex="panel === tab.id ? 0 : -1"
        class="flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-xs transition-colors"
        :class="panel === tab.id ? 'bg-soft font-medium text-ink' : 'text-muted hover:bg-soft/60'"
        @click="choosePanel(tab.id)"
      >
        <component
          :is="tab.icon"
          class="size-4"
        />
        {{ tab.label }}
      </button>
    </div>
    <div
      ref="content"
      class="inspector-content min-h-0 overflow-y-auto"
    >
      <LivePaintControls
        v-if="paintControls && active === 'paint'"
        :presets="ui.presets"
        :custom-colors="ui.customColors"
        :show-paint-target="ui.showPaintTarget"
      />
      <div
        v-show="panel === 'layers'"
        :id="`${panelId}-layers-panel`"
        role="tabpanel"
        :aria-labelledby="`${panelId}-layers-tab`"
      >
        <BoardLayers
          :show-import="ui.showImport"
          :show-native-layers="ui.showNativeLayers"
          :show-history="false"
          :board="board"
          :side="side"
          v-model:silk="silk"
          v-model:fabrication="fabrication"
          @import-graphic="$emit('importGraphic')"
        />
        <LibraryPanel />
      </div>
      <div
        v-show="panel === 'color'"
        :id="`${panelId}-color-panel`"
        role="tabpanel"
        :aria-labelledby="`${panelId}-color-tab`"
      >
        <ArtworkPalette :active="panel === 'color'" />
      </div>
      <div
        v-show="panel === 'layout'"
        :id="`${panelId}-layout-panel`"
        role="tabpanel"
        :aria-labelledby="`${panelId}-layout-tab`"
      >
        <SmartPlacement />
      </div>
      <div
        v-show="panel === 'board'"
        :id="`${panelId}-board-panel`"
        role="tabpanel"
        :aria-labelledby="`${panelId}-board-tab`"
      >
        <BoardProperties
          :board="board"
          v-model:mask="mask"
        />
        <PrintReviewPanel />
        <BoardRefreshReview />
      </div>
    </div>
    <EditorHistory class="shrink-0 border-t border-line px-3 py-2" />
    <footer class="shrink-0 border-t border-line"><slot name="footer" /></footer>
  </aside>
</template>

<style scoped>
.inspector-content {
  overflow-anchor: none;
}
</style>
