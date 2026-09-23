<script setup lang="ts">
import { useArtwork } from '../../composables/artwork/useArtwork'
import ArtworkLayers from '../artwork/ArtworkLayers.vue'
import KicadLayers from '../kicad/KicadLayers.vue'
import { Plus, FolderPlus, ImagePlus } from '@lucide/vue'
import type { BoardPackage } from '../../utils/boardPackage'
const props = withDefaults(
  defineProps<{
    board: BoardPackage
    side: string
    showImport?: boolean
    showNativeLayers?: boolean
  }>(),
  { showImport: true, showNativeLayers: true }
)
const { create, canAdd } = useArtwork()
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
          @click="create(action.kind, props.side)"
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
    <ArtworkLayers
      :side="side"
      :bounds="board.bounds"
    />
    <KicadLayers
      v-if="showNativeLayers"
      :side="side"
      v-model:silk="silk"
      v-model:fabrication="fabrication"
    />
  </section>
</template>
