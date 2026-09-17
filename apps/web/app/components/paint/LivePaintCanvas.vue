<script setup lang="ts">
import type { BoardPackage } from '~/utils/boardPackage'
import { artworkRows } from '~/utils/artwork'
import { createArtworkPaint, type ArtworkPaintHit } from '~/utils/artworkPaint'
import { createPaintRegions, paintRegionSource, type PaintRegion } from '~/utils/paintRegions'
import { isNativeSilk, nativeSilkSettings } from '~/utils/nativeSilk'
const props = defineProps<{ board: BoardPackage; side: string; silk: boolean }>()
const emit = defineEmits<{ error: [message: string] }>()
const { items, canAdd, selection, checkpoint, destination, descendants } = useArtwork()
const { color, presets, pointer, cycle } = useLivePaint()
const { setColor } = useNativeSilk()
const paintingArtwork = computed(() => !!selection.value && !isNativeSilk(selection.value))
const surface = useTemplateRef('surface')
const maskId = useId()
const artworkHost = useTemplateRef('artworkHost')
const artworkHighlight = useTemplateRef('artworkHighlight')
const current = computed(() => items.value.find((item) => item.id === selection.value))
const scoped = computed(() => {
  if (!current.value) return []
  const ids = new Set([current.value.id, ...descendants(current.value.id)])
  return artworkRows(items.value, props.side, true)
    .filter((row) => row.visible && !row.item.kind && ids.has(row.item.id))
    .map((row) => row.item)
})
let artworkPaint: ReturnType<typeof createArtworkPaint> | undefined
watch(
  [artworkHost, scoped],
  () => {
    artworkPaint?.dispose()
    artworkPaint = artworkHost.value
      ? createArtworkPaint(artworkHost.value, scoped.value, props.side, maskId)
      : undefined
    refreshHover()
  },
  { flush: 'post' }
)
watch(selection, () => {
  stop()
  leave()
})
type Target = (PaintRegion & { inkPath?: string }) | ArtworkPaintHit
const regionAt = computed(() =>
  createPaintRegions(props.board.layers[`${props.side}-silkscreen`] ?? [])
)
const hovered = shallowRef<Target>()
watch(
  () => [props.board, props.side, props.silk],
  () => {
    stop()
    hovered.value = undefined
    pointer.value = null
  }
)
const geometry = computed(() => ({
  outline: new Path2D(props.board.outline),
  holes: new Path2D(props.board.holes),
  pads: (props.board.layers[`${props.side}-mask`] ?? []).map((path) => new Path2D(path)),
  ink: [...(props.board.layers[`${props.side}-silkscreen`] ?? [])]
    .reverse()
    .filter((path) => /z\s*$/i.test(path))
    .map((path) => ({ path, shape: new Path2D(path) }))
}))
let context: CanvasRenderingContext2D | null = null
const hit = (x: number, y: number, inverse: DOMMatrix) => {
  if (!paintingArtwork.value && !props.silk) return
  const element = document.elementFromPoint(x, y)
  if (!element || !surface.value?.ownerSVGElement?.contains(element)) return
  const point = new DOMPoint(x, y).matrixTransform(inverse)
  context ??= document.createElement('canvas').getContext('2d')
  if (
    !context ||
    !context.isPointInPath(geometry.value.outline, point.x, point.y, 'evenodd') ||
    context.isPointInPath(geometry.value.holes, point.x, point.y, 'evenodd') ||
    geometry.value.pads.some((pad) => context!.isPointInPath(pad, point.x, point.y, 'evenodd'))
  )
    return
  if (paintingArtwork.value) return artworkPaint?.hit(x, y)
  const ink = geometry.value.ink.find(({ shape }) =>
    context!.isPointInPath(shape, point.x, point.y, 'evenodd')
  )
  if (ink) return { path: ink.path, bounds: props.board.bounds, inkPath: ink.path }
  return regionAt.value(point)
}
let stroke:
  | { id: number; x: number; y: number; changed: boolean; visited: Set<PaintRegion | string> }
  | undefined
const fill = (region: Target) => {
  const key = 'key' in region ? region.key : (region.inkPath ?? region)
  if (!stroke || stroke.visited.has(key)) return
  stroke.visited.add(key)
  if ('artworkId' in region) {
    const source = artworkPaint?.recolor(region, color.value)
    if (!source) return
    if (new TextEncoder().encode(source).length > 2_000_000) {
      emit('error', 'This graphic exceeds the 2 MB limit.')
      return
    }
    if (!stroke.changed) {
      checkpoint()
      stroke.changed = true
    }
    items.value = items.value.map((item) =>
      item.id === region.artworkId ? { ...item, source } : item
    )
    emit('error', '')
    return
  }
  if (region.inkPath) {
    const ink = nativeSilkSettings(items.value, props.side)
    if ((ink?.colors[region.inkPath] ?? ink?.baseColor) === color.value) return
    if (!stroke.changed) {
      checkpoint()
      stroke.changed = true
    }
    setColor(props.side, region.inkPath, color.value, false)
    emit('error', '')
    return
  }
  const source = paintRegionSource(region, color.value, props.side)
  if (source.length > 2_000_000) {
    emit('error', 'This region exceeds the 2 MB graphic limit. Simplify the silkscreen in KiCad.')
    return
  }
  const { x, y, width, height } = region.bounds
  const existing = artworkRows(items.value, props.side, true).find(
    ({ item, visible }) =>
      visible &&
      !item.kind &&
      item.rotation === 0 &&
      item.x === x &&
      item.y === y &&
      item.width === width &&
      item.height === height &&
      item.source.includes('data-overprint-fill="true"') &&
      item.source.includes(`d="${region.path}"`)
  )?.item
  if (existing?.source === source) return
  if (!existing && !canAdd.value) {
    emit('error', 'This project already has 100 layers, folders, and graphics.')
    return
  }
  if (!stroke.changed) {
    checkpoint()
    stroke.changed = true
  }
  const name = `${presets.find((preset) => preset.color === color.value)?.name ?? 'Color'} fill`
  if (existing) {
    items.value = items.value.map((item) =>
      item.id === existing.id ? { ...item, source, name } : item
    )
  } else {
    const item = {
      id: crypto.randomUUID(),
      name,
      source,
      side: props.side,
      visible: true,
      x,
      y,
      width,
      height,
      rotation: 0,
      parentId: destination(props.side)
    }
    items.value.push(item)
  }
  emit('error', '')
}
const stop = () => {
  const id = stroke?.id
  stroke = undefined
  if (id !== undefined && surface.value?.hasPointerCapture(id))
    surface.value.releasePointerCapture(id)
}
const refreshHover = () => {
  const cursor = pointer.value
  const matrix = surface.value?.getScreenCTM()
  artworkHighlight.value?.replaceChildren()
  if (!cursor || !matrix) return
  hovered.value = hit(cursor.x, cursor.y, matrix.inverse())
  if (hovered.value && 'artworkId' in hovered.value && artworkHighlight.value)
    artworkPaint?.highlight(hovered.value, artworkHighlight.value, color.value)
  pointer.value = { ...cursor, valid: !!hovered.value }
}
watch(color, refreshHover, { flush: 'post' })
const move = (event: PointerEvent) => {
  const matrix = surface.value?.getScreenCTM()
  if (!matrix) return
  const inverse = matrix.inverse()
  if (stroke && !(event.buttons & 1)) stop()
  if (stroke && event.pointerId === stroke.id) {
    // Sample along the sweep as well as event positions so fast movement can
    // reach narrow faces. One gesture owns one checkpoint, including re-entry.
    const steps = Math.min(
      512,
      Math.max(1, Math.ceil(Math.hypot(event.clientX - stroke.x, event.clientY - stroke.y) / 3))
    )
    for (let index = 1; index <= steps; index++) {
      const region = hit(
        stroke.x + ((event.clientX - stroke.x) * index) / steps,
        stroke.y + ((event.clientY - stroke.y) * index) / steps,
        inverse
      )
      if (region) fill(region)
    }
    stroke.x = event.clientX
    stroke.y = event.clientY
  }
  pointer.value = { x: event.clientX, y: event.clientY, valid: false }
  refreshHover()
}
const start = (event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  surface.value?.ownerSVGElement?.focus({ preventScroll: true })
  stop()
  stroke = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    changed: false,
    visited: new Set()
  }
  surface.value?.setPointerCapture(event.pointerId)
  move(event)
  if (hovered.value) fill(hovered.value)
  else if (paintingArtwork.value) {
    if (artworkPaint?.unsupported)
      emit('error', 'Painting clipped or masked SVG graphics is not supported yet.')
    else if (!scoped.value.length) emit('error', 'Select a visible SVG graphic to paint.')
  } else if (!props.silk) emit('error', 'Show Silkscreen to paint its regions.')
}
const leave = () => {
  hovered.value = undefined
  pointer.value = null
  artworkHighlight.value?.replaceChildren()
}
const blur = () => {
  stop()
  leave()
}
const key = (event: KeyboardEvent) => {
  if (
    document.querySelector('dialog[open]') ||
    (event.target as HTMLElement)?.closest(
      'input, textarea, select, [contenteditable], [role="dialog"]'
    )
  )
    return
  if (event.ctrlKey || event.metaKey || event.altKey) {
    stop()
    return
  }
  const pressed = event.key.toLowerCase()
  if (['arrowleft', 'arrowright', 'a', 'd'].includes(pressed)) {
    event.preventDefault()
    stop()
    cycle(['arrowright', 'd'].includes(pressed) ? 1 : -1)
  }
  if (event.key === 'Escape') {
    stop()
    leave()
  }
}
onMounted(() => {
  window.addEventListener('blur', blur)
  window.addEventListener('keydown', key)
})
onBeforeUnmount(() => {
  blur()
  artworkPaint?.dispose()
  window.removeEventListener('blur', blur)
  window.removeEventListener('keydown', key)
})
</script>

<template>
  <g
    ref="surface"
    @pointermove="move"
    @pointerleave="leave"
    @pointerdown="start"
    @pointerup="stop"
    @pointercancel="stop"
    @lostpointercapture="stop"
  >
    <defs>
      <mask
        :id="maskId"
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
        <path
          v-for="(path, index) in board.layers[`${side}-mask`]"
          :key="index"
          :d="path"
          fill="black"
          fill-rule="evenodd"
        />
      </mask>
    </defs>
    <g
      ref="artworkHost"
      opacity="0"
      pointer-events="none"
      aria-hidden="true"
    />
    <rect
      :x="board.bounds.x"
      :y="board.bounds.y"
      :width="board.bounds.width"
      :height="board.bounds.height"
      fill="transparent"
    />
    <g
      v-if="hovered && !('artworkId' in hovered)"
      :mask="`url(#${maskId})`"
      pointer-events="none"
    >
      <path
        :d="hovered.path"
        :fill="color"
        fill-opacity="0.2"
        fill-rule="evenodd"
        stroke="#161b18"
        stroke-width="4"
        vector-effect="non-scaling-stroke"
      />
      <path
        :d="hovered.path"
        fill="none"
        stroke="#ff637e"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
    </g>
    <g
      ref="artworkHighlight"
      data-artwork-paint-preview
      :mask="`url(#${maskId})`"
      pointer-events="none"
    />
  </g>
</template>
