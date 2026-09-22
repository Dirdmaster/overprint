<script setup lang="ts">
import { useArtwork } from '../../composables/artwork/useArtwork'
import { computed } from 'vue'
import type { BoardPackage } from '~/utils/boardPackage'
import { nativeSilkInks } from '~/utils/nativeSilk'
const props = defineProps<{ board: BoardPackage; side: string }>()
const { items } = useArtwork()
const inks = computed(() =>
  nativeSilkInks(
    props.board.layers[`${props.side}-silkscreen`] ?? [],
    items.value,
    props.side,
    '#f4f1e8'
  )
)
</script>

<template>
  <g data-native-silkscreen>
    <path
      v-for="({ path, color }, index) in inks"
      :key="index"
      :d="path"
      :fill="color"
      fill-rule="evenodd"
    />
  </g>
</template>
