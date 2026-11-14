<script setup lang="ts">
import {
  useEditorState,
  editorOwnsEvent,
  editorEventTarget
} from '../../composables/editor/editorState'
const editorState = useEditorState()
import { usePaintSurfaces, type PaintStroke } from '../../composables/artwork/usePaintSurfaces'
import { editablePaintPatch } from '../../utils/editablePaint'
import { solidPaintColor } from '../../utils/paintColor'
import { useCanvasToolState } from '../../composables/canvas/useCanvasToolState'
import { useLivePaint } from '../../composables/artwork/useLivePaint'
import { useNativeSilk } from '../../composables/artwork/useNativeSilk'
import { useArtwork } from '../../composables/artwork/useArtwork'
import { shallowRef, computed, watch, onMounted, onBeforeUnmount, useTemplateRef, useId } from 'vue'
import type { BoardPackage } from '../../utils/boardPackage'
import { artworkRows, isArtworkLocked } from '../../utils/artwork'
import { createArtworkPaint, type ArtworkPaintHit } from '../../utils/artworkPaint'
import { createPaintRegions, paintRegionSource, type PaintRegion } from '../../utils/paintRegions'
import { nativeSilkSettings } from '../../utils/nativeSilk'
import { validateGoldRegions } from '../../utils/enigPaint'
const props = defineProps<{
  board: BoardPackage
  side: string
  silk: boolean
  keyboardActive?: boolean
}>()
const emit = defineEmits<{ error: [message: string] }>()
const { items, canAdd, checkpoint, destination, canPatch, patchItems } = useArtwork()
const {
  color,
  hoverSurface,
  previewColor,
  material,
  presets,
  pointer,
  cycle,
  rememberColor,
  picking,
  holdingAlt,
  sampler,
  feedback
} = useLivePaint()
const { selected } = useCanvasToolState()
const surfaces = usePaintSurfaces()
const surfaceKey = Symbol('paint-face')
const { setColor } = useNativeSilk()
const surface = useTemplateRef('surface')
const maskId = useId()
const artworkHost = useTemplateRef('artworkHost')
const sampleHost = useTemplateRef('sampleHost')
let samplePaint: ReturnType<typeof createArtworkPaint> | undefined
const allVisible = computed(() =>
  artworkRows(items.value, props.side, true)
    .filter((row) => row.visible && !row.item.kind && !row.item.nativeSilk)
    .map((row) => row.item)
)
watch(
  [sampleHost, allVisible, sampler],
  () => {
    samplePaint?.dispose()
    samplePaint =
      sampler.value && sampleHost.value
        ? createArtworkPaint(sampleHost.value, allVisible.value, props.side, `${maskId}-sample`)
        : undefined
    refreshHover()
  },
  { flush: 'post' }
)
const artworkHighlight = useTemplateRef('artworkHighlight')
let artworkPaint: ReturnType<typeof createArtworkPaint> | undefined
watch(
  [artworkHost, allVisible],
  () => {
    artworkPaint?.dispose()
    artworkPaint = artworkHost.value
      ? createArtworkPaint(artworkHost.value, allVisible.value, props.side, maskId)
      : undefined
    refreshHover()
  },
  { flush: 'post' }
)
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
  const element = (surface.value?.getRootNode() as Document | ShadowRoot)?.elementFromPoint(x, y)
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
  const artwork = artworkPaint?.hit(x, y, false)
  if (artwork) return artwork
  const ink = props.silk
    ? geometry.value.ink.find(({ shape }) =>
        context!.isPointInPath(shape, point.x, point.y, 'evenodd')
      )
    : undefined
  if (ink) {
    if (material.value === 'enig') return createPaintRegions([ink.path])(point)
    return { path: ink.path, bounds: props.board.bounds, inkPath: ink.path }
  }
  const cutout = artworkPaint?.hit(x, y)
  if (cutout) return cutout
  return props.silk ? regionAt.value(point) : undefined
}
let stroke: PaintStroke | undefined
const fill = (region: Target, stroke: PaintStroke) => {
  const key = `${props.side}:${'key' in region ? region.key : (region.inkPath ?? region.path)}`
  if (!stroke || stroke.visited.has(key)) return
  stroke.visited.add(key)
  if ('artworkId' in region) {
    const item = items.value.find((item) => item.id === region.artworkId)
    if (
      region.blocked ||
      (item && (isArtworkLocked(items.value, item.id) || item.library || item.gold))
    ) {
      emit(
        'error',
        region.blocked ??
          (item?.library
            ? 'Detach this linked composition in Library before painting its contents.'
            : item?.gold
              ? 'ENIG gold is a physical finish. Paint a color-ink region instead.'
              : 'Unlock this artwork before painting it.')
      )
      return
    }
    if (item?.appearance || ((item?.vector || item?.text) && material.value === 'enig')) {
      emit(
        'error',
        'Convert this editable artwork to SVG in its inspector before using Live Paint.'
      )
      return
    }
  }
  if (material.value === 'enig') {
    if (
      'artworkId' in region &&
      items.value.find((item) => item.id === region.artworkId)?.drawing
    ) {
      emit('error', 'Convert this editable artwork to SVG before painting it with ENIG.')
      return
    }
    let target: PaintRegion
    try {
      target = 'artworkId' in region ? artworkPaint!.goldRegion(region, surface.value!) : region
    } catch (error) {
      emit('error', error instanceof Error ? error.message : 'This shape cannot become ENIG.')
      return
    }
    const { x, y, width, height } = target.bounds
    const source = paintRegionSource(target, '#cfac61', props.side)
    const existing = items.value.find(
      (item) => item.gold?.path === target.path && item.side === props.side
    )
    if (existing) return
    if (!canAdd.value) {
      emit('error', 'This project already has 100 layers, folders, and graphics.')
      return
    }
    const item = {
      id: crypto.randomUUID(),
      name: 'ENIG gold',
      source,
      side: props.side,
      visible: true,
      x,
      y,
      width,
      height,
      rotation: 0,
      parentId: destination(props.side),
      gold: { path: target.path, bounds: target.bounds }
    }
    try {
      validateGoldRegions(props.board, [...items.value, item], props.side)
    } catch (error) {
      emit(
        'error',
        error instanceof Error ? error.message : 'This gold region cannot be placed safely.'
      )
      return
    }
    if (!stroke.changed) {
      checkpoint()
      stroke.changed = true
    }
    items.value.push(item)
    emit('error', '')
    return
  }
  if ('artworkId' in region) {
    const item = items.value.find((item) => item.id === region.artworkId)
    if (!item || isArtworkLocked(items.value, region.artworkId)) return
    if (item.library) {
      emit('error', 'Detach this linked composition in Library before painting its contents.')
      return
    }
    if (item.drawing || item.vector || item.text) {
      if (region.cutout) {
        emit(
          'error',
          'Convert this editable artwork to SVG to paint a counter or cutout separately.'
        )
        return
      }
      const patch = editablePaintPatch(item, color.value)
      if (!patch || !canPatch(item.id, patch)) return
      if (!stroke.changed) {
        checkpoint()
        stroke.changed = true
      }
      patchItems([{ id: item.id, patch }])
      rememberColor()
      feedback.value = ''
      emit('error', '')
      return
    }
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
      item.id === region.artworkId
        ? {
            ...item,
            source,
            gold: undefined,
            ...(item.source.includes('data-overprint-fill="true"')
              ? {
                  name: `${presets.value.find((preset) => preset.color === color.value)?.name ?? 'Color'} fill`
                }
              : {})
          }
        : item
    )
    rememberColor()
    feedback.value = ''
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
    rememberColor()
    feedback.value = ''
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
  if (existing && isArtworkLocked(items.value, existing.id)) return
  if (!existing && !canAdd.value) {
    emit('error', 'This project already has 100 layers, folders, and graphics.')
    return
  }
  if (!stroke.changed) {
    checkpoint()
    stroke.changed = true
  }
  const name = `${presets.value.find((preset) => preset.color === color.value)?.name ?? 'Color'} fill`
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
  rememberColor()
  feedback.value = ''
  emit('error', '')
}
const stop = () => {
  const id = stroke?.id
  stroke = undefined
  if (!hoverSurface.value) {
    pointer.value = null
    previewColor.value = undefined
  }
  if (id !== undefined && surface.value?.hasPointerCapture(id))
    surface.value.releasePointerCapture(id)
}
const sampleAt = (x: number, y: number) => {
  const matrix = surface.value?.getScreenCTM()
  if (!matrix) return
  const element = (surface.value?.getRootNode() as Document | ShadowRoot)?.elementFromPoint(x, y)
  if (!element || !surface.value?.ownerSVGElement?.contains(element)) return
  const point = new DOMPoint(x, y).matrixTransform(matrix.inverse())
  context ??= document.createElement('canvas').getContext('2d')
  if (
    !context ||
    !context.isPointInPath(geometry.value.outline, point.x, point.y, 'evenodd') ||
    context.isPointInPath(geometry.value.holes, point.x, point.y, 'evenodd') ||
    geometry.value.pads.some((pad) => context!.isPointInPath(pad, point.x, point.y, 'evenodd'))
  )
    return
  const art = samplePaint?.hit(x, y, false)
  if (art) return samplePaint?.sample(art)
  const ink = props.silk
    ? geometry.value.ink.find(({ shape }) =>
        context!.isPointInPath(shape, point.x, point.y, 'evenodd')
      )
    : undefined
  if (ink) {
    const settings = nativeSilkSettings(items.value, props.side)
    return solidPaintColor(settings?.colors[ink.path] ?? settings?.baseColor ?? '#f4f1e8')
  }
}
const refreshHover = () => {
  const cursor = pointer.value
  const matrix = surface.value?.getScreenCTM()
  artworkHighlight.value?.replaceChildren()
  if (hoverSurface.value !== surfaceKey) {
    hovered.value = undefined
    return
  }
  if (!cursor || !matrix) return
  if (sampler.value) {
    hovered.value = undefined
    previewColor.value = sampleAt(cursor.x, cursor.y)
    pointer.value = { ...cursor, valid: !!previewColor.value }
    return
  }
  hovered.value = hit(cursor.x, cursor.y, matrix.inverse())
  if (
    hovered.value &&
    'artworkId' in hovered.value &&
    !hovered.value.blocked &&
    artworkHighlight.value
  )
    artworkPaint?.highlight(hovered.value, artworkHighlight.value, color.value)
  previewColor.value = undefined
  pointer.value = {
    ...cursor,
    valid:
      !!hovered.value &&
      !(
        'artworkId' in hovered.value &&
        (hovered.value.blocked || isArtworkLocked(items.value, hovered.value.artworkId))
      )
  }
}
watch([color, material], refreshHover, { flush: 'post' })
watch(
  sampler,
  () => {
    stop()
    refreshHover()
  },
  { flush: 'post' }
)
const move = (event: PointerEvent) => {
  const matrix = surface.value?.getScreenCTM()
  if (!matrix) return
  if (stroke && !(event.buttons & 1)) stop()
  if (stroke && event.pointerId === stroke.id) {
    // Sample along the sweep as well as event positions so fast movement can
    // reach narrow faces. One gesture owns one checkpoint, including re-entry.
    const steps = Math.min(
      512,
      Math.max(1, Math.ceil(Math.hypot(event.clientX - stroke.x, event.clientY - stroke.y) / 3))
    )
    for (let index = 1; index <= steps; index++) {
      const x = stroke.x + ((event.clientX - stroke.x) * index) / steps
      const y = stroke.y + ((event.clientY - stroke.y) * index) / steps
      for (const face of surfaces.values()) face.paintAt(x, y, stroke)
    }
    stroke.x = event.clientX
    stroke.y = event.clientY
  }
  hoverSurface.value = [...surfaces].find(([, face]) =>
    face.contains(event.clientX, event.clientY)
  )?.[0]
  pointer.value = { x: event.clientX, y: event.clientY, valid: false }
  previewColor.value = undefined
  for (const face of surfaces.values()) face.refresh()
}
const start = (event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  surface.value?.ownerSVGElement?.focus({ preventScroll: true })
  stop()
  hoverSurface.value = surfaceKey
  if (event.altKey || sampler.value) {
    material.value = 'ink'
    const value = sampleAt(event.clientX, event.clientY)
    pointer.value = { x: event.clientX, y: event.clientY, valid: !!value }
    if (value) {
      color.value = value
      rememberColor(value)
      picking.value = false
      feedback.value = `Sampled ${value.toUpperCase()}`
      emit('error', '')
    } else
      feedback.value =
        'Choose a solid ink region. Transparent areas and pattern fills cannot be sampled.'
    refreshHover()
    return
  }
  stroke = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    changed: false,
    visited: new Set()
  }
  surface.value?.setPointerCapture(event.pointerId)
  move(event)
  if (hovered.value && stroke) fill(hovered.value, stroke)
}
const leave = () => {
  hovered.value = undefined
  if (hoverSurface.value === surfaceKey) {
    hoverSurface.value = undefined
    pointer.value = null
    previewColor.value = undefined
  }
  artworkHighlight.value?.replaceChildren()
}
const clearPointer = () => {
  hoverSurface.value = undefined
  pointer.value = null
  previewColor.value = undefined
  for (const face of surfaces.values()) face.refresh()
}
const blur = () => {
  holdingAlt.value = false
  stop()
  clearPointer()
}
const key = (event: KeyboardEvent) => {
  if (!props.keyboardActive || !editorOwnsEvent(editorState, event)) return
  if (
    (editorState.globalShortcuts ? document : editorState.root.value)?.querySelector(
      'dialog[open]'
    ) ||
    editorEventTarget(event)?.closest(
      'dialog, input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]'
    )
  )
    return
  if (event.key === 'Alt') {
    holdingAlt.value = true
    stop()
    refreshHover()
    return
  }
  if (event.key.toLowerCase() === 'i' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    stop()
    material.value = 'ink'
    picking.value = !picking.value
    feedback.value = ''
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    stop()
    return
  }
  const pressed = event.key.toLowerCase()
  if (['arrowleft', 'arrowright'].includes(pressed)) {
    event.preventDefault()
    stop()
    cycle(pressed === 'arrowright' ? 1 : -1)
  }
  if (event.key === 'Escape') {
    picking.value = false
    stop()
    clearPointer()
  }
}
const releaseAlt = (event: KeyboardEvent) => {
  if (event.key === 'Alt') {
    holdingAlt.value = false
    refreshHover()
  }
}
onMounted(() => {
  surfaces.set(surfaceKey, {
    contains: (x, y) => {
      const element = (surface.value?.getRootNode() as Document | ShadowRoot)?.elementFromPoint(
        x,
        y
      )
      if (!element || !surface.value?.ownerSVGElement?.contains(element)) return false
      const matrix = surface.value?.getScreenCTM()
      if (!matrix) return false
      const p = new DOMPoint(x, y).matrixTransform(matrix.inverse()),
        b = props.board.bounds
      return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height
    },
    paintAt: (x, y, gesture) => {
      const matrix = surface.value?.getScreenCTM()
      const region = matrix ? hit(x, y, matrix.inverse()) : undefined
      if (region) fill(region, gesture)
    },
    refresh: refreshHover
  })
  window.addEventListener('keyup', releaseAlt)
  window.addEventListener('blur', blur)
  window.addEventListener('keydown', key)
})
onBeforeUnmount(() => {
  surfaces.delete(surfaceKey)
  if (selected.value !== 'paint') picking.value = false
  window.removeEventListener('keyup', releaseAlt)
  blur()
  artworkPaint?.dispose()
  samplePaint?.dispose()
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
      ref="sampleHost"
      opacity="0"
      pointer-events="none"
      aria-hidden="true"
    />
    <g
      ref="artworkHost"
      data-paint-source
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
