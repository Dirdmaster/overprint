<script setup lang="ts">
import { Plus, FolderPlus, ImagePlus } from '@lucide/vue'
import type { BoardPackage } from '~/utils/boardPackage'
const props = defineProps<{ board: BoardPackage; side: string }>()
const { create, canAdd } = useArtwork()
defineEmits<{ importGraphic: [] }>()
const silk = defineModel<boolean>('silk', { required: true })
const fabrication = defineModel<boolean>('fabrication', { required: true })
const mask = defineModel<string>('mask', { required: true })
const layerActions = [
  { kind: 'layer', label: 'Add layer', icon: Plus },
  { kind: 'folder', label: 'Add folder', icon: FolderPlus }
] as const
</script>
<template>
  <aside
    class="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-surface text-xs shadow-lg md:max-h-full md:w-76 md:self-start"
    aria-label="Board properties"
  >
    <header class="shrink-0 border-b border-line"><slot name="header" /></header>
    <div class="min-h-0 overflow-y-auto">
      <section class="border-b border-line pb-6">
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
          :side="side"
          v-model:silk="silk"
          v-model:fabrication="fabrication"
        />
      </section>
      <BoardProperties
        :board="board"
        v-model:mask="mask"
      />
    </div>
    <footer class="shrink-0 border-t border-line"><slot name="footer" /></footer>
  </aside>
</template>
