<script setup lang="ts">
import { computed, useTemplateRef, toRef } from 'vue'
import { PaintBucket, Palette } from '@lucide/vue'
import SelectionColorDialog from './SelectionColorDialog.vue'
import ProjectColorTools from './ProjectColorTools.vue'
import { useSelectionColors } from '../../composables/artwork/useSelectionColors'
import { useArtworkPalette } from '../../composables/artwork/useArtworkPalette'
import { useCanvasToolState } from '../../composables/canvas/useCanvasToolState'
import { svgImageUrl } from '../../utils/svgImage'
import type { ArtworkColor } from '../../utils/artworkColors'
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const { selected, name, rows, editable, busy, error, apply } = useSelectionColors(
  toRef(props, 'active')
)
const { palette } = useArtworkPalette()
const { selected: tool } = useCanvasToolState()
const dialog = useTemplateRef('dialog')
const groups = computed(() =>
  (['fill', 'stroke'] as const)
    .map((role) => ({
      role,
      label: role === 'fill' ? 'Fill' : 'Stroke',
      colors: rows.value.filter((entry) => entry.role === role)
    }))
    .filter((group) => group.colors.length)
)
const colorName = (color: string) =>
  palette.value.find((entry) => entry.color.toLowerCase() === color.toLowerCase())?.name ?? color
const edit = (entry: ArtworkColor, event: MouseEvent) =>
  dialog.value?.show(entry, event.currentTarget as HTMLElement)
</script>
<template>
  <section
    v-if="active"
    class="space-y-4 p-4"
    aria-label="Color tools"
  >
    <header>
      <h2 class="font-medium">{{ name || 'Color' }}</h2>
      <p class="mt-1 text-xs text-muted">
        {{
          name
            ? 'Change the colors used in this selection.'
            : 'Select artwork to edit its colors, or paint directly on the board.'
        }}
      </p>
    </header>
    <figure
      v-if="selected.length === 1"
      class="artwork-preview flex h-28 items-center justify-center rounded-lg p-3"
    >
      <img
        :src="svgImageUrl(selected[0]!.source)"
        :alt="`${name} artwork`"
        class="max-h-full w-full object-contain"
      />
    </figure>
    <section
      v-for="group in groups"
      :key="group.role"
      class="space-y-2"
      :aria-label="`${group.label} colors`"
    >
      <h3 class="text-xs font-medium text-muted">{{ group.label }}</h3>
      <button
        v-for="entry in group.colors"
        :key="entry.color"
        class="flex min-h-11 w-full items-center gap-3 rounded-lg border border-line bg-soft px-3 py-2 text-left disabled:opacity-40"
        :aria-label="`Change ${group.label.toLowerCase()} ${entry.color}`"
        :disabled="!editable || busy"
        @click="edit(entry, $event)"
      >
        <span
          class="size-7 rounded-md border border-black/15"
          :style="{ backgroundColor: entry.color }"
        />
        <span class="min-w-0 flex-1 truncate text-sm">{{ colorName(entry.color) }}</span>
        <Palette class="size-4 text-muted" />
      </button>
    </section>
    <p
      v-if="name && !rows.length"
      class="text-xs text-muted"
    >
      Use Paint to recolor individual regions of this artwork.
    </p>
    <p
      v-if="name && !editable"
      class="text-xs text-muted"
    >
      Unlock and detach artwork to change its colors. Use Paint for ENIG.
    </p>
    <button
      class="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-soft text-xs"
      @click="tool = 'paint'"
    >
      <PaintBucket class="size-4" />
      Paint directly on the board
      <span class="text-muted">K</span>
    </button>
    <p
      v-if="error"
      role="alert"
      class="text-xs text-red-500"
    >
      {{ error }}
    </p>
    <ProjectColorTools :initial-color="rows[0]?.color ?? '#ffd426'" />
    <SelectionColorDialog
      ref="dialog"
      :palette="palette"
      :selection-name="name"
      :busy="busy"
      @apply="apply"
    />
  </section>
</template>

<style scoped>
.artwork-preview {
  background-color: #62665e;
  background-image: repeating-conic-gradient(#ffffff08 0 25%, transparent 0 50%);
  background-size: 1rem 1rem;
}
</style>
