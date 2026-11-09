<script setup lang="ts">
import type { BoardPackage } from '~/utils/boardPackage'

const props = defineProps<{
  board: BoardPackage
  image: string
  side: 'front' | 'back'
}>()
const bounds = computed(() => props.board.bounds)
const viewBox = computed(() => {
  const { x, y, width, height } = bounds.value
  return `${x} ${y} ${width} ${height}`
})
const transform = computed(() => {
  const { x, width } = bounds.value
  return props.side === 'back' ? `translate(${2 * x + width} 0) scale(-1 1)` : undefined
})
</script>

<template>
  <svg
    class="max-h-[65svh] w-full"
    :viewBox="viewBox"
    role="img"
    :aria-label="side === 'front' ? $t('panel.frontPreview') : $t('panel.backPreview')"
  >
    <path
      :d="`${board.outline} ${board.holes}`"
      :transform="transform"
      fill="#5d6267"
      fill-rule="evenodd"
    />
    <image
      :href="image"
      :x="bounds.x"
      :y="bounds.y"
      :width="bounds.width"
      :height="bounds.height"
      preserveAspectRatio="none"
    />
  </svg>
</template>
