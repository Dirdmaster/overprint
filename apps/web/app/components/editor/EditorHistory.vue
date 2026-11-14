<script setup lang="ts">
import { Undo2, Redo2 } from '@lucide/vue'
import { useArtwork } from '../../composables/artwork/useArtwork'
const { past, future, undo, redo } = useArtwork()
</script>
<template>
  <div
    class="flex items-center gap-2 text-muted"
    role="group"
    aria-label="Edit history"
  >
    <button
      :disabled="!past.length"
      class="rounded p-1 disabled:opacity-30"
      aria-label="Undo"
      title="Undo"
      @click="undo"
    >
      <Undo2 class="size-4" />
    </button>
    <button
      :disabled="!future.length"
      class="rounded p-1 disabled:opacity-30"
      aria-label="Redo"
      title="Redo"
      @click="redo"
    >
      <Redo2 class="size-4" />
    </button>
  </div>
</template>
