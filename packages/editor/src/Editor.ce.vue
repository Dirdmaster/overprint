<script setup lang="ts">
import { shallowRef, watch, inject } from 'vue'
import { editorPartKey } from './parts'
import EditorSession from './EditorSession.vue'
import { editorSession, type EditorController } from './controller'
import type { EditorPresentation } from '../../../apps/web/app/utils/editorPresentation'
const kind = inject(editorPartKey, 'editor')
const props = withDefaults(
  defineProps<EditorPresentation & { controller: EditorController }>(),
  {
    showShortcuts: true,
    customColors: true,
    showPaintTarget: true,
    showImport: true,
    showNativeLayers: true,
    showViewMode: true,
    showBoardSide: true,
    grid: true,
  },
)
const session = shallowRef(editorSession(props.controller))
watch(
  () => props.controller,
  (controller) => {
    session.value = editorSession(controller)
  },
)
</script>
<template>
  <EditorSession
    :key="session.id"
    :controller="controller"
    :kind="kind"
    :ui="props"
  />
</template>
