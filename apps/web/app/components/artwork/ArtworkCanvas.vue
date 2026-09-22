<script setup lang="ts">
import { useArtwork } from '../../composables/artwork/useArtwork'
import { useCanvasTools } from '../../composables/canvas/useCanvasTools'
import ArtworkTransformHandles from './ArtworkTransformHandles.vue'
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { artworkRows, type Artwork } from '~/utils/artwork'
const props = defineProps<{ side: string; interactive?: boolean }>()
const { items, selectionIds, selectedArtwork, select, checkpoint } = useArtwork()
const { active } = useCanvasTools()
const visible = computed(() =>
  artworkRows(items.value, props.side, true)
    .filter((row) => row.visible && !row.item.kind)
    .map((row) => row.item)
)
let gesture:
  | {
      item: Artwork
      moving: Artwork[]
      checkpointed: boolean
      start: DOMPoint
      inverse: DOMMatrix
      mode: string
      handle?: { x: number; y: number }
      target: Element
      pointerId: number
    }
  | undefined
const finish = () => {
  gesture = undefined
}
const start = (
  event: PointerEvent,
  item: Artwork,
  mode: string,
  handle?: { x: number; y: number }
) => {
  if (event.button !== 0 || active.value !== 'select') return
  event.stopPropagation()
  event.preventDefault()
  if (mode === 'move' && event.shiftKey) {
    select(item.id, true)
    return
  }
  const target = event.currentTarget as SVGGraphicsElement
  const container = target.closest('[data-artwork-layer]')
    ?.parentElement as unknown as SVGGraphicsElement
  const matrix = container.getScreenCTM()
  if (!matrix) return
  if (!selectionIds.value.includes(item.id)) select(item.id)
  gesture = {
    item: { ...item },
    moving: selectedArtwork.value
      .filter((value) => value.side === props.side)
      .map((value) => ({ ...value })),
    checkpointed: false,
    start: new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()),
    inverse: matrix.inverse(),
    mode,
    handle,
    target,
    pointerId: event.pointerId
  }
  target.setPointerCapture(event.pointerId)
}
const move = (event: PointerEvent) => {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  const { item, start, inverse, mode, handle } = gesture
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse)
  if (!gesture.checkpointed) {
    if (Math.hypot(point.x - start.x, point.y - start.y) < 0.01) return
    checkpoint()
    gesture.checkpointed = true
  }
  if (mode === 'move') {
    const moving = gesture.moving
    // Clamp the whole selection as one translation, preserving relative spacing.
    const dx = Math.max(
      -10000 - Math.min(...moving.map((value) => value.x)),
      Math.min(10000 - Math.max(...moving.map((value) => value.x)), point.x - start.x)
    )
    const dy = Math.max(
      -10000 - Math.min(...moving.map((value) => value.y)),
      Math.min(10000 - Math.max(...moving.map((value) => value.y)), point.y - start.y)
    )
    const changes = new Map(
      moving.map((value) => [value.id, { ...value, x: value.x + dx, y: value.y + dy }])
    )
    items.value = items.value.map((value) => changes.get(value.id) ?? value)
    return
  }
  let patch: Partial<Artwork>
  if (mode === 'rotate') {
    const cx = item.x + item.width / 2,
      cy = item.y + item.height / 2
    const rotation =
      item.rotation +
      ((Math.atan2(point.y - cy, point.x - cx) - Math.atan2(start.y - cy, start.x - cx)) * 180) /
        Math.PI
    patch = { rotation: event.shiftKey ? Math.round(rotation / 15) * 15 : rotation }
  } else {
    const cx = item.x + item.width / 2,
      cy = item.y + item.height / 2
    const corner = handle ?? { x: 1, y: 1 }
    const anchor = event.altKey ? { x: 0.5, y: 0.5 } : { x: 1 - corner.x, y: 1 - corner.y }
    const radians = (item.rotation * Math.PI) / 180,
      cos = Math.cos(radians),
      sin = Math.sin(radians)
    const dx = point.x - start.x,
      dy = point.y - start.y
    const localX = cos * dx + sin * dy,
      localY = -sin * dx + cos * dy
    const vx = (corner.x - anchor.x) * item.width,
      vy = (corner.y - anchor.y) * item.height
    const projected = 1 + (localX * vx + localY * vy) / (vx * vx + vy * vy)
    const ratio = Math.min(10000 / Math.max(item.width, item.height), Math.max(0.01, projected))
    const width = item.width * ratio,
      height = item.height * ratio
    // Keep the opposite handle fixed, even on rotated or mirrored artwork.
    const shiftX = (0.5 - anchor.x) * (width - item.width)
    const shiftY = (0.5 - anchor.y) * (height - item.height)
    patch = {
      width,
      height,
      x: cx + cos * shiftX - sin * shiftY - width / 2,
      y: cy + sin * shiftX + cos * shiftY - height / 2
    }
  }
  if (patch.x !== undefined) patch.x = Math.max(-10000, Math.min(10000, patch.x))
  if (patch.y !== undefined) patch.y = Math.max(-10000, Math.min(10000, patch.y))
  if (patch.rotation !== undefined) patch.rotation %= 360
  items.value = items.value.map((value) => (value.id === item.id ? { ...value, ...patch } : value))
}
onMounted(() => window.addEventListener('blur', finish))
onBeforeUnmount(() => window.removeEventListener('blur', finish))
</script>
<template>
  <g
    v-for="item in visible"
    :key="item.id"
    :data-artwork-layer="item.id"
    :transform="`rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})`"
  >
    <image
      v-if="!interactive"
      :href="`data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.source)}`"
      :x="item.x"
      :y="item.y"
      :width="item.width"
      :height="item.height"
      :transform="
        side === 'back' ? `translate(${2 * item.x + item.width} 0) scale(-1 1)` : undefined
      "
      pointer-events="none"
    />
    <template v-else>
      <rect
        :x="item.x"
        :y="item.y"
        :width="item.width"
        :height="item.height"
        fill="transparent"
        :style="{ cursor: active === 'select' ? 'move' : undefined }"
        :stroke="selectionIds.includes(item.id) && active === 'select' ? '#4f87ff' : 'none'"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
        :pointer-events="active === 'select' ? 'all' : 'none'"
        @pointerdown="start($event, item, 'move')"
        @pointermove.stop="move"
        @pointerup="finish"
        @pointercancel="finish"
        @lostpointercapture="finish"
      />
      <ArtworkTransformHandles
        v-if="selectionIds.length === 1 && selectionIds.includes(item.id) && active === 'select'"
        :item="item"
        @start="(event, mode, handle) => start(event, item, mode, handle)"
        @move="move"
        @finish="finish"
      />
    </template>
  </g>
</template>
