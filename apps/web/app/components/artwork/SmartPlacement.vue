<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlacement } from '../../composables/artwork/usePlacement'
import { useArtwork } from '../../composables/artwork/useArtwork'
import { useComposition } from '../../composables/project/useComposition'
import { boardTargets } from '../../utils/placement'
const p = usePlacement(),
  a = useArtwork(),
  c = useComposition()
const targets = computed(() => (c.board.value ? boardTargets(c.board.value, c.side.value) : []))
const search = ref('')
const visibleTargets = computed(() =>
  targets.value
    .map((target, index) => ({ target, index }))
    .filter(({ target }) => target.name.toLowerCase().includes(search.value.trim().toLowerCase()))
    .slice(0, 200)
)
const anchor = ref(0),
  mode = ref<'line' | 'circle'>('line'),
  count = ref(3),
  dx = ref(5),
  dy = ref(0),
  radius = ref(10),
  error = ref('')
const run = (action: () => void) => {
  try {
    action()
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Placement failed.'
  }
}
const place = () =>
  run(() => {
    const target = targets.value[anchor.value],
      selected = a.selectedArtwork.value
    if (!target || !selected.length) throw new Error('Select artwork and a board anchor.')
    const x = Math.min(...selected.map((i) => i.x)),
      y = Math.min(...selected.map((i) => i.y)),
      right = Math.max(...selected.map((i) => i.x + i.width)),
      bottom = Math.max(...selected.map((i) => i.y + i.height))
    a.applyPositions(
      selected.map((i) => ({
        id: i.id,
        x: i.x + target.x - (x + right) / 2,
        y: i.y + target.y - (y + bottom) / 2
      }))
    )
  })
</script>
<template>
  <section
    class="p-4"
    aria-label="Layout tools"
  >
    <h2 class="font-medium">Snapping</h2>
    <div class="mt-3 space-y-3">
      <label class="flex gap-2">
        <input
          v-model="p.enabled.value"
          type="checkbox"
        />
        Snap to board and grid
      </label>
      <label class="block">
        Grid (mm)
        <input
          v-model.number="p.grid.value"
          type="number"
          min="0.01"
          max="100"
          step="0.1"
          aria-label="Snap grid"
          class="w-full rounded bg-soft p-2"
        />
      </label>
      <h2 class="border-t border-line pt-4 font-medium">Align to a board feature</h2>
      <p class="text-muted">Center selected artwork on a pad, component or board anchor.</p>
      <label class="block">
        Find board anchor
        <input
          v-model="search"
          aria-label="Find board anchor"
          class="w-full rounded bg-soft p-2"
          placeholder="Reference or pad number"
        />
      </label>
      <label class="block">
        Board anchor
        <select
          v-model="anchor"
          aria-label="Board anchor"
          class="w-full rounded bg-soft p-2"
        >
          <option
            v-for="{ target, index } in visibleTargets"
            :key="index"
            :value="index"
          >
            {{ target.name }} ({{ target.x.toFixed(2) }}, {{ target.y.toFixed(2) }} mm)
          </option>
        </select>
      </label>
      <button
        class="rounded bg-soft p-2 disabled:opacity-40"
        :disabled="!a.selectedArtwork.value.length"
        @click="place"
      >
        Center selection on anchor
      </button>
      <h2 class="border-t border-line pt-4 font-medium">Repeat artwork</h2>
      <p
        v-if="!a.selectedArtwork.value.length"
        class="text-muted"
      >
        Select artwork on the canvas or in Layers to align or repeat it.
      </p>
      <label class="block">
        Arrangement
        <select
          v-model="mode"
          aria-label="Repeat mode"
          class="w-full rounded bg-soft p-2"
        >
          <option value="line">Line</option>
          <option value="circle">Circle</option>
        </select>
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label
          v-for="field in [
            { key: 'count', label: 'Total copies' },
            ...(mode === 'line'
              ? [
                  { key: 'dx', label: 'X spacing (mm)' },
                  { key: 'dy', label: 'Y spacing (mm)' }
                ]
              : [{ key: 'radius', label: 'Radius (mm)' }])
          ]"
          :key="field.key"
        >
          {{ field.label }}
          <input
            v-if="field.key === 'count'"
            v-model.number="count"
            type="number"
            min="2"
            max="50"
            aria-label="Total copies"
            class="w-full rounded bg-soft p-2"
          />
          <input
            v-else-if="field.key === 'dx'"
            v-model.number="dx"
            type="number"
            aria-label="Repeat X spacing"
            class="w-full rounded bg-soft p-2"
          />
          <input
            v-else-if="field.key === 'dy'"
            v-model.number="dy"
            type="number"
            aria-label="Repeat Y spacing"
            class="w-full rounded bg-soft p-2"
          />
          <input
            v-else
            v-model.number="radius"
            type="number"
            min="0"
            aria-label="Repeat radius"
            class="w-full rounded bg-soft p-2"
          />
        </label>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="rounded bg-soft p-2 disabled:opacity-40"
          :disabled="!a.selectedArtwork.value.length"
          @click="run(() => p.prepareRepeat(mode, count, dx, dy, radius))"
        >
          Preview repeat
        </button>
        <button
          class="rounded bg-soft p-2 disabled:opacity-40"
          :disabled="!p.preview.value.length"
          @click="run(p.applyRepeat)"
        >
          Apply repeat
        </button>
        <button
          class="rounded bg-soft p-2 disabled:opacity-40"
          v-if="p.preview.value.length"
          @click="p.preview.value = []"
        >
          Cancel preview
        </button>
      </div>
      <p
        v-if="p.preview.value.length"
        class="text-muted"
        role="status"
      >
        Previewing {{ p.preview.value.length }} new graphics. Apply to keep them, or cancel.
      </p>
      <p
        v-if="error"
        role="alert"
      >
        {{ error }}
      </p>
    </div>
  </section>
</template>
