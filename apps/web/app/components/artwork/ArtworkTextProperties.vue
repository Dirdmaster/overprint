<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Artwork } from '../../utils/artwork'
import { renderText, textMeasurements, type ArtworkText } from '../../utils/artworkText'
import { useArtworkText } from '../../composables/artwork/useArtworkText'
const props = defineProps<{ item: Artwork }>()
const { updateText, outlineText } = useArtworkText()
const error = ref('')
// Dragging and resizing change the transform, not the glyph geometry.
const outlined = computed(() => (props.item.text ? renderText(props.item.text) : undefined))
const measurements = computed(() => textMeasurements(props.item, outlined.value))
const update = (patch: Partial<ArtworkText>) => {
  try {
    updateText(props.item.id, patch)
    error.value = ''
  } catch (value) {
    error.value = value instanceof Error ? value.message : 'Unable to update text.'
  }
}
const numberFields = [
  { key: 'size', label: 'Font size (mm)', min: 0.2, max: 100, step: 0.1 },
  { key: 'stroke', label: 'Stroke width (mm)', min: 0.02, max: 10, step: 0.01 },
  { key: 'tracking', label: 'Letter spacing (mm)', min: 0, max: 20, step: 0.05 },
  { key: 'lineHeight', label: 'Line spacing', min: 1, max: 4, step: 0.1 }
] as const
</script>
<template>
  <fieldset
    v-if="item.text"
    class="mt-4 space-y-3"
    aria-label="Text properties"
  >
    <legend class="mb-2 font-medium">Text</legend>
    <label class="flex flex-col gap-1 text-muted">
      Content
      <textarea
        :key="item.id"
        :value="item.text.content"
        aria-label="Text content"
        maxlength="256"
        rows="3"
        class="w-full resize-y rounded bg-soft p-2 text-ink"
        @change="update({ content: ($event.target as HTMLTextAreaElement).value })"
      />
    </label>
    <label class="flex flex-col gap-1 text-muted">
      Font
      <select
        :value="item.text.font"
        aria-label="Text font"
        class="rounded bg-soft p-2 text-ink"
        @change="
          update({ font: ($event.target as HTMLSelectElement).value as ArtworkText['font'] })
        "
      >
        <option value="newstroke">KiCad stroke</option>
        <option value="newstroke-mono">KiCad stroke mono</option>
      </select>
    </label>
    <div class="grid grid-cols-2 gap-2">
      <label
        v-for="field in numberFields"
        :key="field.key"
        class="flex flex-col gap-1 text-muted"
      >
        {{ field.label }}
        <input
          type="number"
          :aria-label="field.label"
          :value="item.text[field.key]"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          class="w-full rounded bg-soft p-2 text-ink"
          @change="update({ [field.key]: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <label class="flex flex-col gap-1 text-muted">
        Alignment
        <select
          :value="item.text.align"
          aria-label="Text alignment"
          class="rounded bg-soft p-2 text-ink"
          @change="
            update({ align: ($event.target as HTMLSelectElement).value as ArtworkText['align'] })
          "
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-muted">
        Color
        <input
          type="color"
          :value="item.text.color"
          aria-label="Text color"
          class="h-9 w-full rounded bg-soft p-1"
          @change="update({ color: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>
    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        :checked="item.text.italic"
        @change="update({ italic: ($event.target as HTMLInputElement).checked })"
      />
      Italic text
    </label>
    <div
      v-if="measurements"
      class="space-y-1 rounded bg-soft p-2 text-muted"
      aria-label="Text measurements"
    >
      <p>Ink height: {{ measurements.inkHeight.toFixed(2) }} mm</p>
      <p>Stroke after scaling: {{ measurements.stroke.toFixed(3) }} mm</p>
      <p>
        Review small strokes, counters, and spacing in the manufacturing preview before ordering.
      </p>
    </div>
    <p
      v-if="error"
      role="alert"
      class="text-ink"
    >
      {{ error }}
    </p>
    <button
      class="rounded bg-soft px-3 py-2 text-ink"
      @click="outlineText(item.id)"
    >
      Convert text to outlines
    </button>
  </fieldset>
</template>
