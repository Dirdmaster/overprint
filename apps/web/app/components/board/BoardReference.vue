<script setup lang="ts">
import type { BoardPackage } from '~/utils/boardPackage'
defineProps<{ paths: string[]; bounds: BoardPackage['bounds']; color: string }>()
</script>

<template>
  <!-- Separate paths retain KiCad's polygon union: overlapping shapes must not
       cancel each other under a single even-odd fill operation. -->
  <svg
    :x="bounds.x"
    :y="bounds.y"
    :width="bounds.width"
    :height="bounds.height"
    :viewBox="`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`"
  >
    <path
      v-for="(path, index) in paths"
      :key="index"
      :d="path"
      :fill="color"
      fill-rule="evenodd"
    />
  </svg>
</template>
