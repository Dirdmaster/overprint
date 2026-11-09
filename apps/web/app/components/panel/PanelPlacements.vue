<script setup lang="ts">
import {
  placedBounds,
  ROTATIONS,
  type PanelPlacement,
  type PanelSourceLayout
} from '~/utils/panel/panelLayout'

const props = defineProps<{
  placements: PanelPlacement[]
  sources: PanelSourceLayout[]
  names: string[]
}>()
const emit = defineEmits<{
  reset: []
  edit: [index: number, field: 'x' | 'y' | 'rotation', value: number]
}>()
const placementBounds = (placement: PanelPlacement) =>
  placedBounds(props.sources[placement.source]!.bounds, placement)
</script>

<template>
  <details class="rounded-md border border-line p-2">
    <summary class="cursor-pointer text-sm font-medium">Adjust placements</summary>
    <button
      class="header-action mt-2"
      type="button"
      @click="emit('reset')"
    >
      Auto-layout
    </button>
    <div
      v-for="(placement, index) in placements"
      :key="index"
      class="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2"
    >
      <p class="col-span-3 text-sm">{{ names[placement.source] }} · Copy {{ index + 1 }}</p>
      <label class="grid gap-1 text-xs">
        X (mm)
        <input
          :aria-label="`Copy ${index + 1} X (mm)`"
          :value="Number(placementBounds(placement).x.toFixed(3))"
          class="min-w-0 rounded-md border border-line p-1.5"
          type="number"
          step="0.1"
          @change="emit('edit', index, 'x', ($event.target as HTMLInputElement).valueAsNumber)"
        />
      </label>
      <label class="grid gap-1 text-xs">
        Y (mm)
        <input
          :aria-label="`Copy ${index + 1} Y (mm)`"
          :value="Number(placementBounds(placement).y.toFixed(3))"
          class="min-w-0 rounded-md border border-line p-1.5"
          type="number"
          step="0.1"
          @change="emit('edit', index, 'y', ($event.target as HTMLInputElement).valueAsNumber)"
        />
      </label>
      <label class="grid gap-1 text-xs">
        Rotation
        <select
          :aria-label="`Copy ${index + 1} rotation`"
          :value="placement.rotation"
          class="min-w-0 rounded-md border border-line bg-surface p-1.5"
          @change="
            emit('edit', index, 'rotation', Number(($event.target as HTMLSelectElement).value))
          "
        >
          <option
            v-for="angle in ROTATIONS"
            :key="angle"
            :value="angle"
          >
            {{ angle }}°
          </option>
        </select>
      </label>
    </div>
  </details>
</template>
