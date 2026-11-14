<script setup lang="ts">
import { svgImageAttributes } from '../../utils/svgImage'
import { usePlacement } from '../../composables/artwork/usePlacement'
import { useArtwork } from '../../composables/artwork/useArtwork'
import { useCanvasTools } from '../../composables/canvas/useCanvasTools'
import ArtworkTransformHandles from './ArtworkTransformHandles.vue'
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { artworkRows, isArtworkLocked, type Artwork } from '../../utils/artwork'
const props = defineProps<{ side: string; interactive?: boolean }>()
const { items, selectionIds, selectedArtwork, select, checkpoint, patchItems } = useArtwork()
const { active } = useCanvasTools()
const placement = usePlacement()
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
      toggleOnClick: boolean
      start: DOMPoint
      inverse: DOMMatrix
      mode: string
      handle?: { x: number; y: number }
      target: Element
      pointerId: number
    }
  | undefined
const finish = (event?: Event) => {
  if (event?.type === 'pointerup' && gesture?.toggleOnClick && !gesture.checkpointed)
    select(gesture.item.id, true)
  gesture = undefined
}
const start = (
  event: PointerEvent,
  item: Artwork,
  mode: string,
  handle?: { x: number; y: number }
) => {
  if (
    event.button !== 0 ||
    !['select', 'directSelect'].includes(active.value) ||
    isArtworkLocked(items.value, item.id)
  )
    return
  event.stopPropagation()
  event.preventDefault()
  if (active.value === 'directSelect') {
    select(item.id, event.shiftKey)
    return
  }
  const toggleOnClick = mode === 'move' && event.shiftKey && selectionIds.value.includes(item.id)
  if (mode === 'move' && event.shiftKey && !selectionIds.value.includes(item.id))
    select(item.id, true)
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
    toggleOnClick,
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
  if (gesture.moving.some((item) => isArtworkLocked(items.value, item.id))) {
    finish()
    return
  }
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
    let dx = Math.max(
      -10000 - Math.min(...moving.map((value) => value.x)),
      Math.min(10000 - Math.max(...moving.map((value) => value.x)), point.x - start.x)
    )
    let dy = Math.max(
      -10000 - Math.min(...moving.map((value) => value.y)),
      Math.min(10000 - Math.max(...moving.map((value) => value.y)), point.y - start.y)
    )
    const constrainedAxis = event.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : undefined
    if (constrainedAxis === 'x') dy = 0
    if (constrainedAxis === 'y') dx = 0
    const anchor = { x: item.x + item.width / 2 + dx, y: item.y + item.height / 2 + dy }
    const snapped = placement.snap(anchor, props.side)
    dx += snapped.x - anchor.x
    dy += snapped.y - anchor.y
    if (constrainedAxis === 'x') dy = 0
    if (constrainedAxis === 'y') dx = 0
    const changes = new Map(
      moving.map((value) => [value.id, { ...value, x: value.x + dx, y: value.y + dy }])
    )
    patchItems(
      [...changes.values()].map((value) => ({ id: value.id, patch: { x: value.x, y: value.y } }))
    )
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
  patchItems([{ id: item.id, patch }])
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
      v-bind="svgImageAttributes(item, side)"
      pointer-events="none"
    />
    <template v-else>
      <rect
        :x="item.x"
        :y="item.y"
        :width="item.width"
        :height="item.height"
        fill="transparent"
        :style="{
          cursor: active === 'select' && !isArtworkLocked(items, item.id) ? 'move' : undefined
        }"
        :stroke="
          selectionIds.includes(item.id) && ['select', 'directSelect'].includes(active)
            ? '#4f87ff'
            : 'none'
        "
        stroke-width="1"
        vector-effect="non-scaling-stroke"
        :pointer-events="
          ['select', 'directSelect'].includes(active) && !isArtworkLocked(items, item.id)
            ? 'all'
            : 'none'
        "
        @pointerdown="start($event, item, 'move')"
        @pointermove.stop="move"
        @pointerup="finish($event)"
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
