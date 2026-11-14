<script setup lang="ts">
import { Pipette, PaintBucket } from '@lucide/vue'
import { useEditorState } from '../../composables/editor/editorState'
import { useLivePaint } from '../../composables/artwork/useLivePaint'
const { root } = useEditorState()
const { pointer, color, previewColor, material, sampler } = useLivePaint()
</script>
<template>
  <Teleport :to="root || 'body'">
    <div
      v-if="pointer"
      aria-hidden="true"
      class="pointer-events-none fixed z-40 flex items-center gap-1.5 rounded-full border border-line bg-surface p-1.5 shadow-sm"
      :style="{
        left: `min(${pointer.x + 14}px,calc(100vw - 64px))`,
        top: `min(${pointer.y + 16}px,calc(100vh - 36px))`,
        opacity: pointer.valid ? 1 : 0.45
      }"
    >
      <component
        :is="sampler ? Pipette : PaintBucket"
        class="size-3.5 text-ink"
      />
      <span
        class="size-3.5 rounded-full border border-black/20"
        :style="{
          backgroundColor: material === 'enig' && !sampler ? '#cfac61' : previewColor || color
        }"
      />
    </div>
  </Teleport>
</template>
