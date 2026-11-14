<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Pipette, ChevronDown, ChevronUp, PaintBucket } from '@lucide/vue'
import { useLivePaint } from '../../composables/artwork/useLivePaint'
import { useCanvasToolState } from '../../composables/canvas/useCanvasToolState'
const { selected } = useCanvasToolState()
import PaintSavedColors from './PaintSavedColors.vue'
import { useComposition } from '../../composables/project/useComposition'
import ColorSwatchPicker from '../color/ColorSwatchPicker.vue'
defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    presets?: { name: string; color: string }[]
    customColors?: boolean
    showPaintTarget?: boolean
    compact?: boolean
  }>(),
  { customColors: true, showPaintTarget: true, compact: false }
)
const { color, material, presets, customPresets, picking, sampler, recent, feedback } =
  useLivePaint()
const { palette } = useComposition()
const defaultSwatches = computed(() =>
  presets.value.filter(
    (entry) =>
      !palette.value.some((saved) => saved.color.toLowerCase() === entry.color.toLowerCase())
  )
)
const expanded = ref(false)
const chooseMaterial = (value: 'ink' | 'enig') => {
  material.value = value
  picking.value = false
  feedback.value = ''
}
watch(
  color,
  () => {
    feedback.value = ''
    picking.value = false
  },
  { flush: 'sync' }
)
watch(
  () => props.presets,
  (value) => {
    customPresets.value = value
  },
  { immediate: true }
)
const customRecent = computed(() =>
  recent.value.filter((color) => !presets.value.some((preset) => preset.color === color))
)
const pick = () => {
  selected.value = 'paint'
  material.value = 'ink'
  picking.value = !picking.value
  feedback.value = ''
}
</script>
<template>
  <section
    v-bind="$attrs"
    :class="
      compact
        ? 'w-76 max-w-[calc(100vw-6rem)] rounded-xl border border-line p-2 shadow-lg'
        : 'border-b border-line p-4'
    "
    class="space-y-3 bg-surface text-xs"
    aria-label="Live paint settings"
  >
    <header class="flex items-center justify-between text-ink">
      <h2 class="flex items-center gap-2 font-medium">
        <PaintBucket class="size-4" />
        Paint
      </h2>
      <div class="flex items-center gap-2">
        <kbd
          v-if="!compact"
          class="text-muted"
        >
          K
        </kbd>
        <button
          v-if="compact"
          class="flex size-6 items-center justify-center text-muted"
          :aria-expanded="expanded"
          aria-label="More paint settings"
          @click="expanded = !expanded"
        >
          <component
            :is="expanded ? ChevronUp : ChevronDown"
            class="size-4"
          />
        </button>
      </div>
    </header>
    <div
      class="grid grid-cols-2 gap-1 rounded-lg bg-soft p-1"
      role="group"
      aria-label="Paint finish"
    >
      <button
        class="flex h-8 items-center justify-center gap-2 rounded-md"
        :class="material === 'ink' ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
        aria-label="Color ink"
        :aria-pressed="material === 'ink'"
        @click="chooseMaterial('ink')"
      >
        <span
          class="size-3 rounded-full border border-black/15"
          :style="{ backgroundColor: color }"
        />
        Color
      </button>
      <button
        class="flex h-8 items-center justify-center gap-2 rounded-md"
        :class="material === 'enig' ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
        aria-label="ENIG gold"
        :aria-pressed="material === 'enig'"
        @click="chooseMaterial('enig')"
      >
        <span class="size-3 rounded-full border border-black/15 bg-[#cfac61]" />
        ENIG gold
      </button>
    </div>
    <template v-if="material === 'ink'">
      <div class="flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <ColorSwatchPicker
            v-model="color"
            label="Fill color"
            :presets="presets"
            :custom="customColors"
            block
          />
        </div>
        <button
          aria-label="Pick ink color (I)"
          title="Pick ink color (I). Hold Option/Alt to sample temporarily."
          :aria-pressed="picking"
          class="flex size-8 shrink-0 items-center justify-center rounded-md border border-line"
          :class="sampler ? 'bg-accent text-on-accent' : 'bg-soft text-muted'"
          @click="pick"
        >
          <Pipette class="size-4" />
        </button>
      </div>
      <PaintSavedColors />
      <template v-if="!compact || expanded">
        <div
          v-if="defaultSwatches.length"
          class="space-y-1.5"
        >
          <h3 class="text-muted">Default colors</h3>
          <div
            class="grid grid-cols-8 gap-1.5"
            role="group"
            aria-label="Paint swatches"
          >
            <button
              v-for="preset in defaultSwatches"
              :key="preset.color"
              class="flex aspect-square items-center justify-center rounded-md border border-black/15"
              :style="{ backgroundColor: preset.color }"
              :title="preset.name"
              :aria-label="`Paint ${preset.name}`"
              :aria-pressed="color === preset.color"
              @click="color = preset.color"
            >
              <Check
                v-if="color === preset.color"
                class="size-4 rounded-full bg-black/60 p-0.5 text-white"
              />
            </button>
          </div>
        </div>
        <div
          v-if="customRecent.length"
          class="space-y-1.5"
        >
          <h3 class="text-muted">Recently used</h3>
          <div
            role="group"
            aria-label="Recent ink colors"
            class="grid grid-cols-8 gap-1.5"
          >
            <button
              v-for="value in customRecent"
              :key="value"
              :style="{ backgroundColor: value }"
              :aria-label="`Recent ink ${value}`"
              :title="value"
              class="aspect-square rounded-md border border-black/15"
              @click="color = value"
            />
          </div>
        </div>
        <p
          class="leading-relaxed text-muted"
          aria-label="Paint feedback"
          aria-live="polite"
        >
          {{
            feedback ||
            (sampler
              ? 'Click a solid ink region to sample its color.'
              : 'Click or drag to fill. Hold Option to sample; ← → changes swatches.')
          }}
        </p>
      </template>
    </template>
    <p
      v-else-if="!compact || expanded"
      class="leading-relaxed text-muted"
    >
      Creates copper and solder-mask openings for an ENIG finish. Clearances are checked before
      placing gold.
    </p>
  </section>
</template>
