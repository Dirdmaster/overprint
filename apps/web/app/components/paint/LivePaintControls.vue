<script setup lang="ts">
import { useEditorState } from '../../composables/editor/editorState'
const { root: editorRoot } = useEditorState()
import { useLivePaint } from '../../composables/artwork/useLivePaint'
import { useArtwork } from '../../composables/artwork/useArtwork'
import ColorSwatchPicker from '../color/ColorSwatchPicker.vue'
import { computed } from 'vue'
import { Check, PaintBucket } from '@lucide/vue'
import { isNativeSilk } from '../../utils/nativeSilk'
defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    presets?: { name: string; color: string }[]
    customColors?: boolean
    showPaintTarget?: boolean
  }>(),
  { customColors: true, showPaintTarget: true }
)
const { color, presets: defaultPresets, pointer, adjacent } = useLivePaint()
const presets = computed(() => props.presets ?? defaultPresets)
const { items, selection } = useArtwork()
const targetName = computed(() =>
  isNativeSilk(selection.value)
    ? 'KiCad silkscreen'
    : (items.value.find((item) => item.id === selection.value)?.name ??
      (selection.value ? 'Layer unavailable' : 'KiCad silkscreen'))
)
</script>

<template>
  <div
    v-bind="$attrs"
    class="flex w-76 max-w-[calc(100vw-5.5rem)] flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 text-xs shadow-lg"
    aria-label="Live paint settings"
    title="Drag to fill · A/D or ←/→ colors"
  >
    <ColorSwatchPicker
      v-model="color"
      label="Fill color"
      :presets="presets"
      :custom="customColors"
    />
    <div
      class="flex flex-1 gap-1"
      role="group"
      aria-label="Paint swatches"
    >
      <button
        v-for="preset in presets"
        :key="preset.color"
        class="flex h-6 flex-1 items-center justify-center rounded border border-black/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :style="{ backgroundColor: preset.color }"
        :title="preset.name"
        :aria-label="`Paint ${preset.name}`"
        :aria-pressed="color === preset.color"
        @click="color = preset.color"
      >
        <Check
          v-if="color === preset.color"
          class="size-4 rounded bg-black/60 p-0.5 text-white"
        />
      </button>
    </div>
    <div
      v-if="showPaintTarget"
      class="flex w-full items-center gap-2 text-muted"
    >
      <span
        class="min-w-0 flex-1 truncate"
        :title="targetName"
        aria-label="Paint target"
      >
        {{ targetName }}
      </span>
      <button
        v-if="selection && !isNativeSilk(selection)"
        class="shrink-0 rounded px-1 underline hover:text-ink"
        aria-label="Paint KiCad silkscreen"
        @click="selection = null"
      >
        Silkscreen
      </button>
    </div>
  </div>
  <Teleport :to="editorRoot || 'body'">
    <div
      v-if="pointer"
      aria-hidden="true"
      class="pointer-events-none fixed z-40 flex flex-col items-start gap-1"
      :style="{
        left: `min(${pointer.x + 14}px, calc(100vw - 70px))`,
        top: `min(${pointer.y + 18}px, calc(100vh - 64px))`,
        opacity: pointer.valid ? 1 : 0.45
      }"
    >
      <div class="flex items-center gap-0.5 rounded bg-surface/90 p-1 shadow-sm">
        <span
          v-for="(swatch, index) in adjacent"
          :key="index"
          class="rounded-sm border border-black/20"
          :class="index === 1 ? 'size-4 ring-1 ring-ink' : 'size-3'"
          :style="{ backgroundColor: swatch }"
        />
      </div>
      <PaintBucket class="size-5 rounded bg-surface/90 p-0.5 text-ink shadow-sm" />
    </div>
  </Teleport>
</template>
