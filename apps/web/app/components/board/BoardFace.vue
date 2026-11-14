<script setup lang="ts">
import { computed, useId } from 'vue'
import DrawingCanvas from '../artwork/DrawingCanvas.vue'
import TextCanvas from '../artwork/TextCanvas.vue'
import PlacementOverlay from '../artwork/PlacementOverlay.vue'
import PrintReviewOverlay from '../artwork/PrintReviewOverlay.vue'
import PenCanvas from '../artwork/PenCanvas.vue'
import VectorNodes from '../artwork/VectorNodes.vue'
import { useCanvasToolState } from '../../composables/canvas/useCanvasToolState'
import { isShapeTool } from '../../utils/drawing'
import NativeSilkscreen from './NativeSilkscreen.vue'
import BoardReference from './BoardReference.vue'
import ArtworkCanvas from '../artwork/ArtworkCanvas.vue'
import LivePaintCanvas from '../paint/LivePaintCanvas.vue'
import type { BoardPackage } from '../../utils/boardPackage'
const props = defineProps<{
  board: BoardPackage
  side: string
  background: string
  silk: boolean
  fabrication: boolean
  interactive: boolean
  painting: boolean
}>()
defineEmits<{ error: [message: string] }>()
const faceId = useId()
const { active, selected } = useCanvasToolState()
const mirror = computed(() =>
  props.side === 'back'
    ? `translate(${2 * props.board.bounds.x + props.board.bounds.width} 0) scale(-1 1)`
    : ''
)
</script>
<template>
  <defs>
    <clipPath :id="`${faceId}-board-outline`">
      <path
        :d="board.outline"
        fill-rule="evenodd"
        clip-rule="evenodd"
      />
    </clipPath>
    <clipPath :id="`${faceId}-exposed-mask`">
      <path
        v-for="(path, index) in board.layers[`${side}-mask`]"
        :key="index"
        :d="path"
        fill-rule="evenodd"
        clip-rule="evenodd"
      />
    </clipPath>
    <mask
      :id="`${faceId}-board-holes`"
      maskUnits="userSpaceOnUse"
      :x="board.bounds.x"
      :y="board.bounds.y"
      :width="board.bounds.width"
      :height="board.bounds.height"
    >
      <path
        :d="board.outline"
        fill="white"
        fill-rule="evenodd"
      />
      <path
        :d="board.holes"
        fill="black"
        fill-rule="evenodd"
      />
    </mask>
  </defs>
  <g
    data-board-coordinates
    :transform="mirror"
  >
    <g
      :clip-path="`url(#${faceId}-board-outline)`"
      :mask="`url(#${faceId}-board-holes)`"
      fill-rule="evenodd"
    >
      <path
        :d="board.outline"
        :fill="background"
      />
      <NativeSilkscreen
        v-if="silk"
        :board="board"
        :side="side"
      />
      <ArtworkCanvas :side="side" />
      <g :clip-path="`url(#${faceId}-exposed-mask)`">
        <BoardReference
          :paths="board.layers[`${side}-copper`] ?? []"
          :bounds="board.bounds"
          color="#cfac61"
        />
      </g>
      <BoardReference
        v-if="fabrication"
        :paths="board.layers[`${side}-fabrication`] ?? []"
        :bounds="board.bounds"
        color="#91a1a8"
        opacity="0.65"
      />
    </g>
    <ArtworkCanvas
      :side="side"
      v-if="interactive"
      interactive
    />
    <g :clip-path="`url(#${faceId}-board-outline)`">
      <DrawingCanvas
        v-if="isShapeTool(active)"
        :side="side"
        @error="$emit('error', $event)"
      />
      <TextCanvas
        v-if="active === 'text'"
        :side="side"
        @error="$emit('error', $event)"
      />
      <PenCanvas
        v-if="selected === 'pen'"
        v-show="active === 'pen'"
        :side="side"
        @error="$emit('error', $event)"
      />
    </g>
    <PlacementOverlay
      :side="side"
      :board="board"
    />
    <PrintReviewOverlay :side="side" />
    <VectorNodes
      v-if="interactive && active === 'directSelect'"
      :side="side"
    />
    <LivePaintCanvas
      v-if="painting"
      :board="board"
      :side="side"
      :silk="silk"
      :keyboard-active="interactive"
      @error="$emit('error', $event)"
    />
  </g>
</template>
