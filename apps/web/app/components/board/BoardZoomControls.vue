<script setup lang="ts">
const props = defineProps<{ zoom: number; modelView: boolean }>()
defineEmits<{ zoom: [factor: number]; fit: [] }>()
const zoomPercent = computed(() => Math.round(props.zoom * 100))
</script>

<template>
  <div
    class="grid grid-cols-3 gap-1 p-2 text-muted"
    role="group"
    aria-label="Zoom"
  >
    <button
      class="inspector-button"
      aria-label="Zoom out"
      @click="$emit('zoom', 1 / 1.2)"
    >
      −
    </button>
    <button
      class="inspector-button text-xs"
      :title="`Fit board (${zoomPercent}%)`"
      @click="$emit('fit')"
    >
      Fit
    </button>
    <button
      class="inspector-button"
      aria-label="Zoom in"
      @click="$emit('zoom', 1.2)"
    >
      +
    </button>
    <span
      v-if="!modelView"
      class="sr-only"
    >
      {{ zoomPercent }}%
    </span>
  </div>
</template>
