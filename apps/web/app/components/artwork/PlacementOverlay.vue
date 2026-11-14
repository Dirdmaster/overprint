<script setup lang="ts">
import { svgImageAttributes } from '../../utils/svgImage'
import type { BoardPackage } from '../../utils/boardPackage'
import { usePlacement } from '../../composables/artwork/usePlacement'
defineProps<{ side: string; board: BoardPackage }>()
const { preview, guide, enabled } = usePlacement()
</script>
<template>
  <g pointer-events="none">
    <g
      v-for="item in preview.filter((i) => i.side === side)"
      :key="item.id"
      :transform="`rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})`"
      opacity="0.5"
      data-repeat-preview
    >
      <image v-bind="svgImageAttributes(item, side)" />
    </g>
    <g
      v-if="enabled && guide"
      stroke="#4f87ff"
      stroke-width="1"
      vector-effect="non-scaling-stroke"
      opacity="0.8"
    >
      <path
        :d="`M${guide.x},${board.bounds.y} v${board.bounds.height} M${board.bounds.x},${guide.y} h${board.bounds.width}`"
        vector-effect="non-scaling-stroke"
      />
    </g>
  </g>
</template>
