<script setup lang="ts">
import type { Artwork } from '~/utils/artwork'
const props = defineProps<{ item: Artwork }>()
const emit = defineEmits<{
  start: [event: PointerEvent, mode: 'resize' | 'rotate', handle?: { x: number; y: number }]
  move: [event: PointerEvent]
  finish: []
}>()
const root = useTemplateRef('root')
const pixel = ref(1)
const screenAxes = shallowRef({ a: 1, b: 0, c: 0, d: 1 })
const handles = [
  { x: 0, y: 0, name: 'top left' },
  { x: 0.5, y: 0, name: 'top' },
  { x: 1, y: 0, name: 'top right' },
  { x: 1, y: 0.5, name: 'right' },
  { x: 1, y: 1, name: 'bottom right' },
  { x: 0.5, y: 1, name: 'bottom' },
  { x: 0, y: 1, name: 'bottom left' },
  { x: 0, y: 0.5, name: 'left' }
]
const corners = handles.filter((handle) => handle.x !== 0.5 && handle.y !== 0.5)
const position = (handle: { x: number; y: number }) =>
  `translate(${props.item.x + props.item.width * handle.x} ${props.item.y + props.item.height * handle.y}) scale(${pixel.value})`
const angle = (handle: { x: number; y: number }) => {
  const dx = Math.sign(handle.x - 0.5),
    dy = Math.sign(handle.y - 0.5)
  const m = screenAxes.value
  return (Math.atan2(m.b * dx + m.d * dy, m.a * dx + m.c * dy) * 180) / Math.PI
}
const resizeCursor = (handle: { x: number; y: number }) =>
  ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][
    ((Math.round(angle(handle) / 45) % 4) + 4) % 4
  ]
const rotateCursor = (handle: { x: number; y: number }) => {
  const path = 'M7 18A11 11 0 0 1 18 7M4 14L7 18L11 15M14 4L18 7L15 11'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${angle(handle) + 135} 12 12)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" stroke="white" stroke-width="3.5"/><path d="${path}" stroke="#222" stroke-width="1.5"/></g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`
}
const measure = () => {
  const matrix = root.value?.getScreenCTM()
  if (!matrix) return
  pixel.value = 1 / Math.max(0.0001, Math.hypot(matrix.a, matrix.b))
  screenAxes.value = { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d }
}
let resize: ResizeObserver | undefined
let zoom: MutationObserver | undefined
onMounted(() => {
  const svg = root.value?.ownerSVGElement
  if (!svg) return
  resize = new ResizeObserver(measure)
  resize.observe(svg)
  zoom = new MutationObserver(measure)
  zoom.observe(svg, { attributes: true, attributeFilter: ['viewBox'] })
  measure()
})
watch(() => props.item.rotation, measure, { flush: 'post' })
onBeforeUnmount(() => {
  resize?.disconnect()
  zoom?.disconnect()
})
</script>

<template>
  <g
    ref="root"
    @pointermove.stop="emit('move', $event)"
    @pointerup="emit('finish')"
    @pointercancel="emit('finish')"
    @lostpointercapture="emit('finish')"
  >
    <g
      v-for="corner in corners"
      :key="`rotate-${corner.name}`"
      :transform="position(corner)"
    >
      <rect
        data-rotation-zone
        :x="(corner.x * 2 - 1) * 14 - 10"
        :y="(corner.y * 2 - 1) * 14 - 10"
        width="20"
        height="20"
        fill="transparent"
        stroke="none"
        :style="{ cursor: rotateCursor(corner) }"
        :aria-label="
          corner.name === 'top right' ? 'Rotate artwork' : `Rotate artwork: ${corner.name}`
        "
        @pointerdown="emit('start', $event, 'rotate')"
      >
        <title>Rotate · Shift snaps to 15°</title>
      </rect>
    </g>
    <g
      v-for="handle in handles"
      :key="handle.name"
      data-resize-handle
      :transform="position(handle)"
      :style="{ cursor: resizeCursor(handle) }"
    >
      <rect
        x="-9"
        y="-9"
        width="18"
        height="18"
        fill="transparent"
        stroke="none"
        :aria-label="
          handle.name === 'bottom right' ? 'Resize artwork' : `Resize artwork: ${handle.name}`
        "
        @pointerdown="emit('start', $event, 'resize', handle)"
      >
        <title>Resize proportionally · Alt/Option scales from center</title>
      </rect>
      <rect
        data-handle-square
        x="-3.5"
        y="-3.5"
        width="7"
        height="7"
        fill="white"
        stroke="#4f87ff"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
      />
    </g>
  </g>
</template>
