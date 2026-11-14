<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasView } from '../../composables/canvas/useCanvasView'
const { showBoth, fit } = useCanvasView()
import type { BoardModels } from '../../utils/boardModels'

const props = withDefaults(
  defineProps<{ models?: BoardModels; showViewMode?: boolean; showBoardSide?: boolean }>(),
  { showViewMode: true, showBoardSide: true }
)
defineEmits<{ removeModels: [] }>()
const modelView = defineModel<boolean>('modelView', { required: true })
const side = defineModel<string>('side', { required: true })
const focusSide = (value: string) => {
  side.value = value
  showBoth.value = false
  fit()
}
const showSides = () => {
  showBoth.value = true
  fit()
}

const modelHint = computed(() =>
  props.models?.glb
    ? 'Assembled component preview'
    : 'In KiCad 10, collect and embed 3D models, then save and import the PCB'
)
const modelSummary = computed(() =>
  props.models?.glb
    ? `${props.models.includedReferences.length} components`
    : 'Component preview unavailable'
)
</script>

<template>
  <div
    class="grid grid-cols-2 gap-1 px-2 pt-2"
    role="group"
    v-if="showViewMode"
    aria-label="Preview mode"
  >
    <button
      class="inspector-button text-xs"
      :class="!modelView ? 'bg-accent! text-on-accent!' : ''"
      :aria-pressed="!modelView"
      @click="modelView = false"
    >
      2D
    </button>
    <button
      class="inspector-button text-xs disabled:opacity-45"
      :class="modelView ? 'bg-accent! text-on-accent!' : ''"
      :aria-pressed="modelView"
      :disabled="!models?.glb"
      :title="modelHint"
      @click="modelView = true"
    >
      3D
    </button>
  </div>
  <details
    v-if="models && showViewMode"
    class="mx-2 mt-2 rounded-md bg-soft px-2 py-1.5 text-xs text-muted"
  >
    <summary class="cursor-pointer">
      {{ modelSummary }}
      <span v-if="models.missing.length">· {{ models.missing.length }} missing</span>
    </summary>
    <div class="max-h-32 overflow-y-auto pt-2">
      <p
        v-for="warning in models.warnings"
        :key="warning"
        class="mb-1"
      >
        {{ warning }}
      </p>
      <p
        v-for="missing in models.missing"
        :key="`${missing.reference}-${missing.reason}`"
        class="mb-1"
      >
        <strong>{{ missing.reference }}:</strong>
        {{ missing.reason }}
      </p>
      <button
        v-if="models.glb"
        class="mt-2 underline"
        @click="$emit('removeModels')"
      >
        Remove component models
      </button>
    </div>
  </details>
  <div
    class="grid gap-1 p-2"
    :class="modelView ? 'grid-cols-2' : 'grid-cols-3'"
    role="group"
    v-if="showBoardSide"
    aria-label="Board side"
  >
    <button
      v-if="!modelView"
      :aria-pressed="showBoth"
      class="h-9 rounded-md px-3 text-xs font-medium"
      :class="showBoth ? 'bg-accent text-on-accent' : 'bg-soft text-muted hover:text-ink'"
      @click="showSides"
    >
      Both
    </button>
    <button
      v-for="value in ['front', 'back']"
      :key="value"
      :aria-pressed="side === value && (modelView || !showBoth)"
      class="h-9 rounded-md px-5 text-xs font-medium"
      :class="
        side === value && (modelView || !showBoth)
          ? 'bg-accent text-on-accent'
          : 'bg-soft text-muted hover:text-ink'
      "
      @click="focusSide(value)"
    >
      {{ value === 'front' ? 'Front' : 'Back' }}
    </button>
  </div>
</template>
