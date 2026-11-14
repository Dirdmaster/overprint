<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useCanvasToolState } from '../../composables/canvas/useCanvasToolState'
import { useComposition } from '../../composables/project/useComposition'
import { usePlacement } from '../../composables/artwork/usePlacement'
import { useVectorArtwork } from '../../composables/artwork/useVectorArtwork'
import {
  editorOwnsEvent,
  useEditorState,
  editorEventTarget
} from '../../composables/editor/editorState'
const props = defineProps<{ side: string }>()
const emit = defineEmits<{ error: [message: string] }>()
const { selected, active } = useCanvasToolState(),
  { board, side } = useComposition(),
  { addVector } = useVectorArtwork(),
  editor = useEditorState(),
  placement = usePlacement()
const originalBoard = board.value
const points = ref<[number, number][]>([]),
  cursor = ref<[number, number]>(),
  markerRadius = ref(0.5),
  closing = ref(false)
const preview = computed(() =>
  [...points.value, ...(cursor.value ? [cursor.value] : [])].map((p) => p.join(',')).join(' ')
)
const reset = () => {
  points.value = []
  cursor.value = undefined
  closing.value = false
}
const finish = (closed: boolean) => {
  if (board.value !== originalBoard || points.value.length < (closed ? 3 : 2)) return
  const x = Math.min(...points.value.map((p) => p[0])) - 0.15,
    y = Math.min(...points.value.map((p) => p[1])) - 0.15
  const width = Math.max(0.3, Math.max(...points.value.map((p) => p[0])) - x + 0.15),
    height = Math.max(0.3, Math.max(...points.value.map((p) => p[1])) - y + 0.15)
  try {
    addVector(props.side, x, y, {
      version: 1,
      width,
      height,
      fill: closed ? '#ffd426' : 'none',
      stroke: closed ? 'none' : '#ffd426',
      strokeWidth: 0.3,
      contours: [
        {
          closed,
          points: points.value.map((p) => [
            props.side === 'back' ? width - (p[0] - x) : p[0] - x,
            p[1] - y
          ])
        }
      ]
    })
    reset()
    emit('error', '')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : 'Unable to finish path.')
  }
}
const location = (event: PointerEvent) => {
  const matrix = (event.currentTarget as SVGGraphicsElement).getScreenCTM()
  if (!matrix) return
  markerRadius.value = 4 / Math.hypot(matrix.a, matrix.b)
  let p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  const previous = points.value.at(-1),
    first = points.value[0]
  closing.value =
    !!first &&
    points.value.length >= 3 &&
    Math.hypot(p.x - first[0], p.y - first[1]) <= markerRadius.value * 2
  if (closing.value) return first!
  if (event.shiftKey && previous) {
    const angle =
        Math.round(Math.atan2(p.y - previous[1], p.x - previous[0]) / (Math.PI / 4)) *
        (Math.PI / 4),
      distance = Math.hypot(p.x - previous[0], p.y - previous[1])
    p = new DOMPoint(
      previous[0] + Math.cos(angle) * distance,
      previous[1] + Math.sin(angle) * distance
    )
  }
  const snapped = placement.snap(p, props.side)
  return [snapped.x, snapped.y] as [number, number]
}
const place = (event: PointerEvent) => {
  if (event.button !== 0 || active.value !== 'pen') return
  event.preventDefault()
  event.stopPropagation()
  if ((event.metaKey || event.ctrlKey) && points.value.length >= 2) {
    finish(false)
    return
  }
  const p = location(event),
    previous = points.value.at(-1)
  if (!p) return
  if (closing.value) {
    finish(true)
    return
  }
  if (
    points.value.length < 256 &&
    (!previous || Math.hypot(p[0] - previous[0], p[1] - previous[1]) > 0.01)
  )
    points.value = [...points.value, p]
  cursor.value = p
}
const move = (event: PointerEvent) => {
  if (active.value === 'pen') cursor.value = location(event)
}
const key = (event: KeyboardEvent) => {
  if (
    !editorOwnsEvent(editor, event) ||
    side.value !== props.side ||
    active.value !== 'pen' ||
    editorEventTarget(event)?.closest(
      'input,textarea,select,dialog,[role="dialog"], [contenteditable="true"]'
    )
  )
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (points.value.length >= 2) finish(false)
    else if (points.value.length) reset()
    else selected.value = 'select'
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    finish(false)
  }
  if (event.key === 'Backspace') {
    event.preventDefault()
    event.stopPropagation()
    points.value = points.value.slice(0, -1)
  }
}
watch(
  side,
  () => {
    if (side.value !== props.side) reset()
  },
  { flush: 'sync' }
)
onMounted(() => window.addEventListener('keydown', key))
onBeforeUnmount(() => {
  if (points.value.length >= 2) finish(false)
  window.removeEventListener('keydown', key)
})
</script>
<template>
  <g
    class="cursor-crosshair"
    @pointerdown="place"
    @pointermove="move"
    @pointerleave="cursor = undefined"
    @dblclick.stop.prevent="finish(false)"
  >
    <rect
      x="-10000"
      y="-10000"
      width="20000"
      height="20000"
      fill="transparent"
    />
    <polyline
      v-if="points.length"
      data-pen-preview
      :points="preview"
      fill="none"
      stroke="#4f87ff"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
      pointer-events="none"
    />
    <circle
      v-for="(point, index) in points"
      :key="index"
      :cx="point[0]"
      :cy="point[1]"
      :r="markerRadius"
      :fill="index === 0 && closing ? '#4f87ff' : '#ffffff'"
      stroke="#4f87ff"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
      pointer-events="none"
      :data-pen-first-node="index === 0 ? '' : undefined"
    />
  </g>
</template>
