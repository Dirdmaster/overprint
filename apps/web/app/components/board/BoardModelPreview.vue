<script setup lang="ts">
import { useBoardModelPreview } from '../../composables/canvas/useBoardModelPreview'
import { useTemplateRef } from 'vue'
import type { BoardPackage } from '../../utils/boardPackage'
import type { Artwork } from '../../utils/artwork'
const props = defineProps<{
  board: BoardPackage
  artwork: Artwork[]
  silk: boolean
  background: string
  side: string
  fabrication: boolean
}>()
const host = useTemplateRef('host')
const { loading, error, fit, zoom } = useBoardModelPreview(props, host)
defineExpose({ fit, zoom })
</script>

<template>
  <div
    class="absolute inset-0 md:right-84"
    aria-label="Assembled preview"
  >
    <div
      ref="host"
      class="absolute inset-0"
    />
    <p
      v-if="loading"
      role="status"
      class="absolute left-1/2 top-1/2 -translate-x-1/2 rounded-lg bg-surface px-4 py-3 text-sm shadow"
    >
      Loading component models…
    </p>
    <p
      v-else-if="error"
      role="alert"
      class="absolute left-1/2 top-1/2 max-w-sm -translate-x-1/2 rounded-lg bg-surface p-4 text-sm shadow"
    >
      {{ error }}
    </p>
    <p
      v-else
      class="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100%-2rem)] text-center rounded-md bg-surface/85 px-3 py-2 text-xs text-muted"
    >
      Drag to orbit · Middle / right drag to pan · Scroll to zoom
    </p>
  </div>
</template>
