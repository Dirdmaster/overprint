<script setup lang="ts">
import { useArtwork } from '../../composables/artwork/useArtwork'
import { ref, computed, watch } from 'vue'
import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween
} from '@lucide/vue'
import {
  alignArtwork,
  artworkBounds,
  selectionBounds,
  distributeArtwork,
  type Alignment,
  type AlignmentBounds
} from '~/utils/artworkAlignment'

const props = defineProps<{ bounds: AlignmentBounds; side: string }>()
const { selectedArtwork, applyPositions } = useArtwork()
const selected = computed(() => selectedArtwork.value.filter((item) => item.side === props.side))
const target = ref<'board' | 'selection' | 'key'>('board')
const keyId = ref('')
watch(
  () => selected.value.map((item) => item.id).join(','),
  () => {
    target.value = selected.value.length > 1 ? 'selection' : 'board'
    if (!selected.value.some((item) => item.id === keyId.value))
      keyId.value = selected.value.at(-1)?.id ?? ''
  }
)
const reference = computed(() => {
  if (target.value === 'board') return props.bounds
  const key = selected.value.find((item) => item.id === keyId.value)
  return target.value === 'key' && key ? artworkBounds(key) : selectionBounds(selected.value)
})
const controls: { action: Alignment; label: string; icon: typeof AlignHorizontalJustifyStart }[] = [
  { action: 'left', label: 'Align left', icon: AlignHorizontalJustifyStart },
  { action: 'center-x', label: 'Align horizontal center', icon: AlignHorizontalJustifyCenter },
  { action: 'right', label: 'Align right', icon: AlignHorizontalJustifyEnd },
  { action: 'top', label: 'Align top', icon: AlignVerticalJustifyStart },
  { action: 'center-y', label: 'Align vertical center', icon: AlignVerticalJustifyCenter },
  { action: 'bottom', label: 'Align bottom', icon: AlignVerticalJustifyEnd }
]
const distributions = [
  { axis: 'x', label: 'Horizontal', icon: AlignHorizontalSpaceBetween },
  { axis: 'y', label: 'Vertical', icon: AlignVerticalSpaceBetween }
] as const
const align = (alignment: Alignment) => {
  const movable = selected.value.filter((item) => target.value !== 'key' || item.id !== keyId.value)
  applyPositions(alignArtwork(movable, reference.value, alignment, props.side))
}
const canDistribute = computed(() => selected.value.length >= 3 && target.value !== 'key')
const distributionHint = computed(() =>
  target.value === 'key'
    ? 'Choose Board or Selection to distribute.'
    : 'Select at least three graphics to distribute.'
)
const distribute = (axis: 'x' | 'y') => {
  if (canDistribute.value) applyPositions(distributeArtwork(selected.value, reference.value, axis))
}
</script>

<template>
  <section
    v-if="selected.length"
    class="mt-4 border-t border-line pt-3"
    aria-label="Artwork alignment"
  >
    <div class="mb-3 flex items-center justify-between gap-2">
      <h3 class="font-medium">Align</h3>
      <label class="flex items-center gap-2 text-muted">
        To
        <select
          v-model="target"
          aria-label="Align to"
          class="rounded bg-soft px-2 py-1.5 text-ink"
        >
          <option value="board">Board</option>
          <option
            value="selection"
            :disabled="selected.length < 2"
          >
            Selection
          </option>
          <option
            value="key"
            :disabled="selected.length < 2"
          >
            Key object
          </option>
        </select>
      </label>
    </div>
    <label
      v-if="target === 'key'"
      class="mb-3 flex items-center gap-2 text-muted"
    >
      Key object
      <select
        v-model="keyId"
        aria-label="Key object"
        class="min-w-0 flex-1 rounded bg-soft px-2 py-1.5 text-ink"
      >
        <option
          v-for="item in selected"
          :key="item.id"
          :value="item.id"
        >
          {{ item.name }}
        </option>
      </select>
    </label>
    <div
      class="grid grid-cols-6 gap-1"
      role="group"
      aria-label="Align artwork"
    >
      <button
        v-for="control in controls"
        :key="control.action"
        class="flex h-9 items-center justify-center rounded-md bg-soft text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        :title="control.label"
        :aria-label="control.label"
        @click="align(control.action)"
      >
        <component
          :is="control.icon"
          class="size-4"
        />
      </button>
    </div>
    <div
      class="mt-2 grid grid-cols-2 gap-1"
      role="group"
      aria-label="Distribute artwork"
    >
      <button
        v-for="control in distributions"
        :key="control.axis"
        class="flex h-9 items-center justify-center gap-2 rounded-md bg-soft text-muted hover:text-ink disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-accent"
        :disabled="!canDistribute"
        :title="canDistribute ? `Equal ${control.label.toLowerCase()} gaps` : distributionHint"
        :aria-label="`Distribute ${control.label.toLowerCase()} spacing`"
        @click="distribute(control.axis)"
      >
        <component
          :is="control.icon"
          class="size-4"
        />
        {{ control.label }}
      </button>
    </div>
    <p class="mt-2 text-muted">
      {{
        selected.length > 1
          ? `${selected.length} graphics selected`
          : 'Shift-click graphics to select more.'
      }}
    </p>
  </section>
</template>
