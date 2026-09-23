<script setup lang="ts">
import { EditorRoot, EditorSurface } from '@overprint/editor/vue'
import type { BoardPackage } from '@overprint/editor'
import CheckpointControls from './CheckpointControls.vue'
defineProps<{ board: BoardPackage }>()
</script>

<template>
  <EditorRoot :board="board">
    <CheckpointControls />
    <EditorSurface />
  </EditorRoot>
</template>
