<script setup lang="ts">
import BoardLayers from './BoardLayers.vue'
import BoardProperties from '../board/BoardProperties.vue'
import type { EditorPresentation } from '../../utils/editorPresentation'
import type { BoardPackage } from '../../utils/boardPackage'
withDefaults(defineProps<{ board: BoardPackage; side: string; ui?: EditorPresentation }>(), {
  ui: () => ({})
})
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
    <div class="min-h-0 overflow-y-auto">
      <BoardLayers
        :show-import="ui.showImport"
        :show-native-layers="ui.showNativeLayers"
        :board="board"
        :side="side"
        v-model:silk="silk"
        v-model:fabrication="fabrication"
        @import-graphic="$emit('importGraphic')"
      />
      <BoardProperties
        :board="board"
        v-model:mask="mask"
      />
    </div>
    <footer class="shrink-0 border-t border-line"><slot name="footer" /></footer>
  </aside>
</template>
