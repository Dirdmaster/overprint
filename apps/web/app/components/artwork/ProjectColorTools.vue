<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { Replace, X } from '@lucide/vue'
import ColorSwatchPicker from '../color/ColorSwatchPicker.vue'
import { useArtworkPalette } from '../../composables/artwork/useArtworkPalette'
import { useArtwork } from '../../composables/artwork/useArtwork'
const props = defineProps<{ initialColor: string }>()
const { palette, replaceColor } = useArtworkPalette()
const { items } = useArtwork()
const replaceDialog = useTemplateRef('replaceDialog')
const from = ref('#ffd426'),
  to = ref('#e63136'),
  error = ref(''),
  status = ref(''),
  busy = ref(false)
const documentColors = computed(() => {
  const colors = new Set(
    items.value
      .flatMap((item) => [
        ...(item.source.match(/#[a-f\d]{6}\b/gi) ?? []),
        ...Object.values(item.nativeSilk?.colors ?? {}),
        ...(item.nativeSilk?.baseColor ? [item.nativeSilk.baseColor] : [])
      ])
      .map((color) => color.toLowerCase())
  )
  return [...colors].slice(0, 32).map((color) => ({
    color,
    name: palette.value.find((entry) => entry.color.toLowerCase() === color)?.name ?? color
  }))
})
const openReplace = (event: MouseEvent) => {
  ;(event.currentTarget as HTMLElement).focus()
  from.value =
    documentColors.value.find((entry) => entry.color === props.initialColor.toLowerCase())?.color ??
    documentColors.value[0]?.color ??
    props.initialColor
  error.value = ''
  status.value = ''
  replaceDialog.value?.showModal()
}
const run = async (action: () => unknown) => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    await action()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not update project colors.'
  } finally {
    busy.value = false
  }
}
const replace = () =>
  run(async () => {
    await replaceColor(from.value, to.value)
    status.value = 'Color replaced on both artboards. Undo is available below the inspector.'
  })
</script>
<template>
  <section
    class="space-y-1 border-t border-line pt-3"
    aria-label="Project colors"
  >
    <button
      class="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted hover:bg-soft"
      aria-label="Replace project color"
      @click="openReplace"
    >
      <Replace class="size-4" />
      Replace a color everywhere…
    </button>
  </section>
  <dialog
    ref="replaceDialog"
    aria-label="Replace project color"
    class="m-auto w-md max-w-[calc(100%-2rem)] space-y-4 rounded-2xl border border-line bg-surface p-5 text-sm text-ink shadow-xl"
  >
    <header class="flex items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">Replace a color</h2>
      <button
        class="icon-button"
        aria-label="Close color replacement"
        @click="replaceDialog?.close()"
      >
        <X :size="18" />
      </button>
    </header>
    <p class="text-sm text-muted">
      Change one existing color on
      <strong>both artboards</strong>
      , including hidden artwork.
    </p>
    <div class="grid grid-cols-2 gap-4">
      <div class="min-w-0 space-y-2">
        <p class="text-xs text-muted">Find this color</p>
        <ColorSwatchPicker
          v-model="from"
          label="Find color"
          :presets="documentColors"
          block
          custom
        />
      </div>
      <div class="min-w-0 space-y-2">
        <p class="text-xs text-muted">Replace it with</p>
        <ColorSwatchPicker
          v-model="to"
          label="Replacement color"
          :presets="palette"
          block
          custom
        />
      </div>
    </div>
    <p class="text-xs text-muted">Detach linked artwork and unlock affected layers first.</p>
    <button
      class="primary-button min-h-10 w-full disabled:opacity-40"
      :disabled="busy || from.toLowerCase() === to.toLowerCase()"
      @click="replace"
    >
      Replace across both artboards
    </button>
    <p
      v-if="status"
      role="status"
      class="text-xs text-muted"
    >
      {{ status }}
    </p>
    <p
      v-if="error"
      role="alert"
      class="text-xs text-red-500"
    >
      {{ error }}
    </p>
  </dialog>
</template>
