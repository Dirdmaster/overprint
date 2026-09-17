<script setup lang="ts">
defineProps<{ hasBoard: boolean }>()
</script>

<template>
  <div
    class="canvas-grid flex min-h-svh flex-col"
    :class="hasBoard ? 'md:h-svh md:overflow-hidden' : ''"
  >
    <slot />
    <CanvasFooter class="mt-3" />
  </div>
</template>
