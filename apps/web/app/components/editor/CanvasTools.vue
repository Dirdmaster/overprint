<script setup lang="ts">
import { useCanvasTools } from '../../composables/canvas/useCanvasTools'
import { Hand, MousePointer2, PaintBucket } from '@lucide/vue'
const { selected, active } = useCanvasTools()
</script>

<template>
  <div
    class="flex flex-col gap-2 rounded-lg bg-surface p-1"
    role="toolbar"
    :aria-label="$t('editor.tools.label')"
  >
    <button
      :aria-label="$t('editor.tools.select')"
      :aria-pressed="active === 'select'"
      :title="$t('editor.tools.select')"
      class="relative flex size-9 items-center justify-center rounded-md"
      :class="active === 'select' ? 'bg-accent text-on-accent' : 'text-muted'"
      @click="selected = 'select'"
    >
      <MousePointer2
        class="size-4.5"
        aria-hidden="true"
      />
      <kbd class="absolute bottom-0.5 right-1 text-[0.5rem]">V</kbd>
    </button>
    <button
      :aria-label="$t('editor.tools.hand')"
      :aria-pressed="active === 'hand'"
      :title="$t('editor.tools.hand')"
      class="relative flex size-9 items-center justify-center rounded-md"
      :class="active === 'hand' ? 'bg-accent text-on-accent' : 'text-muted'"
      @click="selected = 'hand'"
    >
      <Hand
        class="size-4.5"
        aria-hidden="true"
      />
      <kbd class="absolute bottom-0.5 right-1 text-[0.5rem]">␣</kbd>
    </button>
    <button
      :aria-label="$t('editor.tools.paint')"
      :aria-pressed="active === 'paint'"
      :title="$t('editor.tools.paint')"
      class="relative flex size-9 items-center justify-center rounded-md"
      :class="active === 'paint' ? 'bg-accent text-on-accent' : 'text-muted'"
      @click="selected = 'paint'"
    >
      <PaintBucket
        class="size-4.5"
        aria-hidden="true"
      />
      <kbd class="absolute bottom-0.5 right-1 text-[0.5rem]">K</kbd>
    </button>
  </div>
</template>
