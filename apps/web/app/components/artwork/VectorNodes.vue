<script setup lang="ts">
import { computed, ref } from 'vue'
import { useArtwork } from '../../composables/artwork/useArtwork'
import { useVectorArtwork } from '../../composables/artwork/useVectorArtwork'
const props = defineProps<{ side: string }>()
const a = useArtwork(),
  { editingNodes, updateVector } = useVectorArtwork()
const item = computed(() =>
  a.selectedArtwork.value.length === 1 && a.selectedArtwork.value[0]?.side === props.side
    ? a.selectedArtwork.value[0]
    : undefined
)
const drag = ref<{
  contour: number
  node: number
  matrix: DOMMatrix
  recorded: boolean
  start: [number, number]
}>()
const transform = computed(() => {
  const i = item.value,
    v = i?.vector
  if (!i || !v) return ''
  const scale = Math.min(i.width / v.width, i.height / v.height),
    x = i.x + (i.width - v.width * scale) / 2,
    y = i.y + (i.height - v.height * scale) / 2
  return `rotate(${i.rotation} ${i.x + i.width / 2} ${i.y + i.height / 2}) translate(${x} ${y}) scale(${scale})${i.side === 'back' ? ` translate(${v.width} 0) scale(-1 1)` : ''}`
})
const start = (event: PointerEvent, contour: number, node: number) => {
  if (
    !item.value ||
    !a.canPatch(item.value.id, { source: item.value.source }) ||
    event.button !== 0
  )
    return
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget as SVGGraphicsElement,
    matrix = target.parentElement as unknown as SVGGraphicsElement
  drag.value = {
    contour,
    node,
    matrix: matrix.getScreenCTM()!.inverse(),
    recorded: false,
    start: [...item.value.vector!.contours[contour]!.points[node]!]
  }
  target.setPointerCapture(event.pointerId)
}
const move = (event: PointerEvent) => {
  const d = drag.value,
    i = item.value
  if (!d || !i?.vector || !(event.buttons & 1)) return
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(d.matrix)
  if (event.shiftKey) {
    if (Math.abs(point.x - d.start[0]) >= Math.abs(point.y - d.start[1])) point.y = d.start[1]
    else point.x = d.start[0]
  }
  const v = JSON.parse(JSON.stringify(i.vector))
  v.contours[d.contour].points[d.node] = [
    Math.max(0, Math.min(v.width, point.x)),
    Math.max(0, Math.min(v.height, point.y))
  ]
  updateVector(i.id, v, !d.recorded)
  d.recorded = true
}
const key = (event: KeyboardEvent, contour: number, node: number) => {
  const i = item.value
  if (!i?.vector || !a.canPatch(i.id, { source: i.source })) return
  const offsets: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  }
  const offset = offsets[event.key]
  if (!offset && !['Delete', 'Backspace'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const v = JSON.parse(JSON.stringify(i.vector)),
    c = v.contours[contour]
  if (offset) {
    const distance = event.shiftKey ? 1 : 0.1
    const matrix = (event.currentTarget as SVGGraphicsElement)
      .parentElement as unknown as SVGGraphicsElement
    const screen = matrix.getScreenCTM()
    if (!screen) return
    const scale = Math.min(i.width / v.width, i.height / v.height)
    const screenScale = Math.hypot(screen.a, screen.b) / scale
    const delta = new DOMPoint(
      offset[0] * distance * screenScale,
      offset[1] * distance * screenScale
    ).matrixTransform(new DOMMatrix([screen.a, screen.b, screen.c, screen.d, 0, 0]).inverse())
    c.points[node] = [
      Math.max(0, Math.min(v.width, c.points[node][0] + delta.x)),
      Math.max(0, Math.min(v.height, c.points[node][1] + delta.y))
    ]
  } else {
    if (c.points.length <= (c.closed ? 3 : 2)) return
    c.points.splice(node, 1)
  }
  updateVector(i.id, v, !event.repeat)
}
</script>
<template>
  <g
    v-if="editingNodes && item?.vector"
    :transform="transform"
  >
    <template
      v-for="(contour, ci) in item.vector.contours"
      :key="ci"
    >
      <circle
        v-for="(point, pi) in contour.points"
        :key="pi"
        :cx="point[0]"
        :cy="point[1]"
        :r="Math.max(item.vector.width, item.vector.height) / 60"
        fill="#ffffff"
        stroke="#4f87ff"
        stroke-width="1.5"
        vector-effect="non-scaling-stroke"
        :aria-label="`Vector node ${ci + 1}:${pi + 1}`"
        data-vector-node
        role="button"
        tabindex="0"
        @pointerdown="start($event, ci, pi)"
        @pointermove.stop="move"
        @pointerup.stop="drag = undefined"
        @pointercancel="drag = undefined"
        @keydown="key($event, ci, pi)"
      />
    </template>
  </g>
</template>
