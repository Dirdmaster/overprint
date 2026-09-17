<script setup lang="ts">
import { readArtwork } from '~/utils/artwork'
import { isNativeSilk, nativeSilkId } from '~/utils/nativeSilk'
import type { BoardPackage } from '~/utils/boardPackage'
const modelView = ref(false)
const modelPreview = useTemplateRef('modelPreview')
const props = defineProps<{ board: BoardPackage }>()
const { items, canAdd, selection, checkpoint, undo, redo, removeSelected, destination } =
  useArtwork()
const graphicPicker = useTemplateRef('graphicPicker')
const graphicError = ref('')
const importGraphic = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (!canAdd.value)
      throw new Error('This project already has 100 layers, folders, and graphics.')
    const graphic = await readArtwork(file)
    const b = props.board.bounds
    const width = Math.min(b.width * 0.5, b.height * 0.5 * graphic.ratio)
    const height = width / graphic.ratio
    const item = {
      id: crypto.randomUUID(),
      name: file.name,
      source: graphic.source,
      side: side.value,
      parentId: destination(side.value),
      x: b.x + (b.width - width) / 2,
      y: b.y + (b.height - height) / 2,
      width,
      height,
      rotation: 0,
      visible: true
    }
    checkpoint()
    items.value.push(item)
    selection.value = item.id
    graphicError.value = ''
  } catch (error) {
    graphicError.value = error instanceof Error ? error.message : 'Unable to import graphic.'
  }
  input.value = ''
}
const artworkKey = (event: KeyboardEvent) => {
  if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable], dialog'))
    return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? redo() : undo()
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selection.value) {
    event.preventDefault()
    removeSelected()
  }
}
onMounted(() => window.addEventListener('keydown', artworkKey))
onBeforeUnmount(() => window.removeEventListener('keydown', artworkKey))
const { side, silk, maskColor, components, board: compositionBoard } = useComposition()
watch(side, (value) => {
  selection.value = isNativeSilk(selection.value) ? nativeSilkId(value) : null
})
const removeModels = () => {
  compositionBoard.value = { ...props.board, models: undefined }
  modelView.value = false
}
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const { active, holdingMiddle } = useCanvasTools()
const fit = () => {
  if (modelView.value) {
    modelPreview.value?.fit()
    return
  }
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}
watch(
  () => props.board,
  () => {
    modelView.value = false
    fit()
  }
)
const viewport = useTemplateRef('viewport')
const inspector = useTemplateRef('inspector')
const area = ref({ width: 1, height: 1, left: 0, right: 1 })
const measure = () => {
  const canvas = viewport.value?.getBoundingClientRect()
  const panel = inspector.value?.getBoundingClientRect()
  if (!canvas?.width || !canvas.height) return
  const overlaps = panel && panel.top < canvas.bottom && panel.bottom > canvas.top
  area.value = {
    width: canvas.width,
    height: canvas.height,
    left: canvas.width >= 768 ? 80 : 24,
    right: overlaps ? panel.left - canvas.left - 24 : canvas.width - 24
  }
}
let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  resizeObserver = new ResizeObserver(measure)
  if (viewport.value) resizeObserver.observe(viewport.value)
  if (inspector.value) resizeObserver.observe(inspector.value)
  measure()
})
onBeforeUnmount(() => resizeObserver?.disconnect())
const viewBox = computed(() => {
  const b = props.board.bounds
  const a = area.value
  const scale =
    Math.max(
      0.001,
      Math.min(Math.max(1, a.right - a.left) / b.width, Math.max(1, a.height - 48) / b.height)
    ) *
    0.95 *
    zoom.value
  const x = b.x + b.width / 2 - (a.left + a.right) / 2 / scale + pan.value.x
  const y = b.y + b.height / 2 - a.height / 2 / scale + pan.value.y
  return `${x} ${y} ${a.width / scale} ${a.height / scale}`
})
const mirror = computed(() =>
  side.value === 'back'
    ? `translate(${2 * props.board.bounds.x + props.board.bounds.width} 0) scale(-1 1)`
    : ''
)
const drag = ref<{ x: number; y: number; scale: number; pointerId: number; buttons: number }>()
const canvasCursor = computed(() => {
  if (drag.value) return 'cursor-grabbing'
  if (active.value === 'hand') return 'cursor-grab'
  if (active.value === 'paint') return 'cursor-crosshair'
  return 'cursor-default'
})
const stop = () => {
  drag.value = undefined
  holdingMiddle.value = false
}
onMounted(() => window.addEventListener('blur', stop))
onBeforeUnmount(() => {
  window.removeEventListener('blur', stop)
  stop()
})
const start = (event: PointerEvent) => {
  if (event.button === 0 && active.value === 'select') {
    selection.value = null
    return
  }
  if (drag.value || (event.button !== 1 && (event.button !== 0 || active.value !== 'hand'))) return
  const svg = event.currentTarget as SVGSVGElement
  const matrix = svg.getScreenCTM()
  if (!matrix) return
  event.preventDefault()
  holdingMiddle.value = event.button === 1
  drag.value = {
    x: event.clientX,
    y: event.clientY,
    scale: matrix.a,
    pointerId: event.pointerId,
    buttons: event.button === 1 ? 4 : 1
  }
  svg.setPointerCapture(event.pointerId)
}
const move = (event: PointerEvent) => {
  if (!drag.value || event.pointerId !== drag.value.pointerId) return
  if (!(event.buttons & drag.value.buttons)) {
    stop()
    return
  }
  pan.value = {
    x: pan.value.x - (event.clientX - drag.value.x) / drag.value.scale,
    y: pan.value.y - (event.clientY - drag.value.y) / drag.value.scale
  }
  drag.value.x = event.clientX
  drag.value.y = event.clientY
}
const changeZoom = (factor: number) => {
  if (modelView.value) {
    modelPreview.value?.zoom(factor)
    return
  }
  zoom.value = Math.min(10, Math.max(0.2, zoom.value * factor))
}
const onWheel = (event: WheelEvent) => changeZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1)
</script>

<template>
  <section
    class="relative flex min-h-0 w-full flex-1 flex-col gap-4"
    aria-label="Board workspace"
  >
    <div
      ref="viewport"
      class="relative min-h-128 min-w-0 flex-1 overflow-hidden md:min-h-0"
    >
      <CanvasTools
        v-if="!modelView"
        class="absolute left-5 top-24 z-10"
      />
      <LivePaintControls
        v-if="!modelView && active === 'paint'"
        class="absolute left-20 top-4 z-10"
      />
      <svg
        v-if="!modelView"
        tabindex="0"
        class="absolute inset-0 size-full touch-none"
        :class="canvasCursor"
        :viewBox="viewBox"
        role="img"
        :aria-label="`${board.name} ${side} board preview`"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="stop"
        @pointercancel="stop"
        @lostpointercapture="stop"
        @auxclick.middle.prevent
        @wheel.prevent="onWheel"
      >
        <defs>
          <clipPath id="board-outline">
            <path
              :d="board.outline"
              fill-rule="evenodd"
              clip-rule="evenodd"
            />
          </clipPath>
          <clipPath id="exposed-mask">
            <path
              v-for="(path, index) in board.layers[`${side}-mask`]"
              :key="index"
              :d="path"
              fill-rule="evenodd"
              clip-rule="evenodd"
            />
          </clipPath>
          <mask
            id="board-holes"
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
        <g :transform="mirror">
          <g
            clip-path="url(#board-outline)"
            mask="url(#board-holes)"
            fill-rule="evenodd"
          >
            <path
              :d="board.outline"
              :fill="maskColor"
            />
            <NativeSilkscreen
              v-if="silk"
              :board="board"
              :side="side"
            />
            <ArtworkCanvas :side="side" />
            <g clip-path="url(#exposed-mask)">
              <BoardReference
                :paths="board.layers[`${side}-copper`] ?? []"
                :bounds="board.bounds"
                color="#cfac61"
              />
            </g>
            <BoardReference
              v-if="components"
              :paths="board.layers[`${side}-fabrication`] ?? []"
              :bounds="board.bounds"
              color="#91a1a8"
              opacity="0.65"
            />
          </g>
          <ArtworkCanvas
            :side="side"
            interactive
          />
          <LivePaintCanvas
            v-if="active === 'paint'"
            :board="board"
            :side="side"
            :silk="silk"
            @error="graphicError = $event"
          />
        </g>
      </svg>
      <LazyBoardModelPreview
        v-if="modelView"
        ref="modelPreview"
        :board="board"
        :artwork="items"
        :side="side"
        :silk="silk"
        :background="maskColor"
        :fabrication="components"
      />
    </div>
    <div
      ref="inspector"
      class="mx-4 flex min-h-0 md:pointer-events-none md:absolute md:bottom-0 md:right-4 md:top-0 md:mx-0 md:w-76"
    >
      <BoardInspector
        class="pointer-events-auto"
        :board="board"
        :side="side"
        @import-graphic="graphicPicker?.click()"
        v-model:silk="silk"
        v-model:fabrication="components"
        v-model:mask="maskColor"
      >
        <template #header>
          <BoardViewControls
            v-model:model-view="modelView"
            v-model:side="side"
            :models="board.models"
            @remove-models="removeModels"
          />
        </template>
        <template #footer>
          <BoardZoomControls
            :zoom="zoom"
            :model-view="modelView"
            @zoom="changeZoom"
            @fit="fit"
          />
        </template>
      </BoardInspector>
    </div>
    <input
      ref="graphicPicker"
      type="file"
      accept=".svg,image/svg+xml"
      aria-label="Choose SVG graphic"
      class="hidden"
      @change="importGraphic"
    />
    <p
      v-if="graphicError"
      role="alert"
      class="absolute left-1/2 top-2 z-20 max-w-md -translate-x-1/2 rounded-lg bg-surface p-3 text-sm shadow-lg"
    >
      {{ graphicError }}
    </p>
  </section>
</template>
