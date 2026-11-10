<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Artwork } from '../../utils/artwork'
import { physicalDrawing } from '../../utils/drawing'
import { useDrawing } from '../../composables/artwork/useDrawing'
const props = defineProps<{ item: Artwork }>()
const { editShape, convertToSvg } = useDrawing()
const error = ref('')
const drawing = computed(() => physicalDrawing(props.item))
const change = (
  key: 'width' | 'height' | 'radius' | 'strokeWidth' | 'fill' | 'stroke',
  event: Event
) => {
  const value = (event.target as HTMLInputElement).value
  try {
    editShape(props.item.id, { [key]: ['fill', 'stroke'].includes(key) ? value : Number(value) })
    error.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Invalid shape parameter.'
  }
}
</script>
<template>
  <fieldset class="mt-3 space-y-2">
    <legend class="mb-2 font-medium">Editable shape</legend>
    <label
      v-for="field in [
        { key: 'width', label: 'Shape width (mm)' },
        { key: 'height', label: 'Shape height (mm)' },
        { key: 'strokeWidth', label: 'Stroke width (mm)' }
      ] as const"
      :key="field.key"
      class="flex flex-col gap-1 text-muted"
    >
      {{ field.label }}
      <input
        type="number"
        min="0"
        max="9990"
        step="0.1"
        :aria-label="field.label"
        :value="Number(drawing[field.key].toFixed(3))"
        class="w-full rounded bg-soft p-2 text-ink"
        @change="change(field.key, $event)"
      />
    </label>
    <label
      v-if="drawing.shape === 'roundedRectangle'"
      class="flex flex-col gap-1 text-muted"
    >
      Corner radius (mm)
      <input
        type="number"
        min="0"
        :max="Math.min(drawing.width, drawing.height) / 2"
        step="0.1"
        aria-label="Corner radius (mm)"
        :value="Number(drawing.radius.toFixed(3))"
        class="w-full rounded bg-soft p-2 text-ink"
        @change="change('radius', $event)"
      />
    </label>
    <label
      v-for="key in (drawing.shape === 'line' ? ['stroke'] : ['fill', 'stroke']) as (
        'fill' | 'stroke'
      )[]"
      :key="key"
      class="flex flex-col gap-1 text-muted"
    >
      {{ key === 'fill' ? 'Fill' : 'Stroke' }} (hex or none)
      <input
        :aria-label="`Shape ${key}`"
        :value="drawing[key]"
        class="w-full rounded bg-soft p-2 text-ink"
        @change="change(key, $event)"
      />
    </label>
    <p
      v-if="error"
      role="alert"
      class="text-red-600"
    >
      {{ error }}
    </p>
    <p class="text-xs text-muted">
      Convert to SVG before Live Paint. Conversion removes shape parameters and can be undone.
    </p>
    <button
      class="rounded bg-soft p-2"
      @click="convertToSvg(item.id)"
    >
      Convert to SVG
    </button>
  </fieldset>
</template>
