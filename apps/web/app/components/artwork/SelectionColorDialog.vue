<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { X } from '@lucide/vue'
import ColorSpectrum from '../color/ColorSpectrum.vue'
import type { ArtworkColor } from '../../utils/artworkColors'
import type { PaletteColor } from '../../utils/artworkAppearance'
const props = defineProps<{ palette: PaletteColor[]; selectionName: string; busy: boolean }>()
const emit = defineEmits<{ apply: [entry: ArtworkColor, color: string] }>()
const dialog = useTemplateRef('dialog'),
  entry = ref<ArtworkColor>(),
  color = ref('#ffffff')
const show = (value: ArtworkColor, trigger: HTMLElement) => {
  trigger.focus()
  entry.value = value
  color.value = value.color
  dialog.value?.showModal()
}
const apply = () => {
  if (entry.value) emit('apply', entry.value, color.value)
  dialog.value?.close()
}
defineExpose({ show })
</script>
<template>
  <dialog
    ref="dialog"
    :aria-label="entry?.role === 'stroke' ? 'Stroke color' : 'Fill color'"
    class="m-auto w-80 max-w-[calc(100%-2rem)] space-y-4 rounded-2xl border border-line bg-surface p-4 text-sm text-ink shadow-xl"
  >
    <header class="flex items-center justify-between gap-2">
      <h2 class="font-semibold">{{ entry?.role === 'stroke' ? 'Stroke color' : 'Fill color' }}</h2>
      <button
        class="icon-button"
        aria-label="Cancel color change"
        @click="dialog?.close()"
      >
        <X :size="18" />
      </button>
    </header>
    <p class="text-xs text-muted">{{ props.selectionName }}</p>
    <ColorSpectrum v-model="color" />
    <div
      v-if="palette.length"
      class="grid grid-cols-6 gap-2"
      role="group"
      aria-label="Saved colors"
    >
      <button
        v-for="preset in palette"
        :key="preset.color"
        :aria-label="preset.name"
        :title="preset.name"
        class="h-8 rounded-md border border-line"
        :style="{ backgroundColor: preset.color }"
        @click="color = preset.color"
      />
    </div>
    <div class="flex items-center justify-between gap-3 border-t border-line pt-3">
      <span class="text-xs text-muted">Selection only</span>
      <button
        class="primary-button min-h-9"
        :disabled="busy"
        @click="apply"
      >
        Apply color
      </button>
    </div>
  </dialog>
</template>
