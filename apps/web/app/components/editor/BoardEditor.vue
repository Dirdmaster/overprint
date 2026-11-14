<script setup lang="ts">
import { useArtwork } from '../../composables/artwork/useArtwork'
import { useCanvasView } from '../../composables/canvas/useCanvasView'
import { useMarqueeSelection } from '../../composables/canvas/useMarqueeSelection'
import { useCanvasTools } from '../../composables/canvas/useCanvasTools'
import { useComposition } from '../../composables/project/useComposition'
import PaintCursor from '../paint/PaintCursor.vue'
import LivePaintControls from '../paint/LivePaintControls.vue'
import BoardFace from '../board/BoardFace.vue'
import BoardModelPreview from '../board/BoardModelPreview.vue'
import BoardViewControls from '../board/BoardViewControls.vue'
import BoardZoomControls from '../board/BoardZoomControls.vue'
import BoardInspector from './BoardInspector.vue'
import CanvasTools from './CanvasTools.vue'
import { ref, computed, watch, onMounted, onBeforeUnmount, useTemplateRef } from 'vue'
import { readArtwork } from '../../utils/artwork'
import { isNativeSilk, nativeSilkId } from '../../utils/nativeSilk'
import type { EditorPresentation } from '../../utils/editorPresentation'
import type { BoardPackage } from '../../utils/boardPackage'
import {
  useEditorState,
  editorOwnsEvent,
  editorEventTarget
} from '../../composables/editor/editorState'
const editorState = useEditorState()
const editorRoot = editorState.root
onMounted(() => {
  if (editorState.globalShortcuts) editorRoot.value?.focus({ preventScroll: true })
})
const { modelView, showBoth, zoom, pan } = useCanvasView()
const modelPreview = useTemplateRef('modelPreview')
const props = withDefaults(
  defineProps<{ board: BoardPackage; canvasOnly?: boolean; ui?: EditorPresentation }>(),
  {
    canvasOnly: false,
    ui: () => ({})
  }
)
const { items, canAdd, selection, checkpoint, undo, redo, removeSelected, destination } =
  useArtwork()
const compactLayout = ref(false)
let removeMediaListener: (() => void) | undefined
onBeforeUnmount(() => removeMediaListener?.())
onMounted(() => {
  const query = window.matchMedia('(max-width: 767px)')
  const update = () => {
    compactLayout.value = query.matches
  }
  update()
  query.addEventListener('change', update)
  removeMediaListener = () => query.removeEventListener('change', update)
})
const graphicPicker = useTemplateRef('graphicPicker')
const graphicError = ref('')
let mounted = true
onBeforeUnmount(() => {
  mounted = false
})
const importGraphic = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const importBoard = compositionBoard.value
  try {
    if (!canAdd.value)
      throw new Error('This project already has 100 layers, folders, and graphics.')
    const graphic = await readArtwork(file)
    if (!mounted || compositionBoard.value !== importBoard) return
    if (!canAdd.value)
      throw new Error('This project already has 100 layers, folders, and graphics.')
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
  if (!editorOwnsEvent(editorState, event)) return
  if (editorEventTarget(event)?.closest('input, textarea, select, [contenteditable], dialog'))
    return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? redo() : undo()
  }
  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    selection.value &&
    active.value !== 'pen'
  ) {
    event.preventDefault()
    removeSelected()
  }
}
onMounted(() => window.addEventListener('keydown', artworkKey))
onBeforeUnmount(() => window.removeEventListener('keydown', artworkKey))
const { side, silk, maskColor, components, board: compositionBoard } = useComposition()
watch(
  side,
  (value) => {
    selection.value = isNativeSilk(selection.value) ? nativeSilkId(value) : null
  },
  { flush: 'sync' }
)
const removeModels = () => {
  compositionBoard.value = { ...props.board, models: undefined }
  modelView.value = false
}
const { active, selected: selectedTool, holdingMiddle } = useCanvasTools()
const marquee = useMarqueeSelection()
watch(active, marquee.cancel)
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
  const tools = viewport.value?.querySelector('[role="toolbar"]')?.getBoundingClientRect()
  const toolInset =
    tools && props.ui.orientation !== 'horizontal' ? tools.right - canvas.left + 16 : 80
  const overlaps = panel && panel.top < canvas.bottom && panel.bottom > canvas.top
  area.value = {
    width: canvas.width,
    height: canvas.height,
    left: !props.canvasOnly ? Math.max(80, toolInset) : 24,
    right: overlaps ? panel.left - canvas.left - 24 : canvas.width - 24
  }
}
let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  resizeObserver = new ResizeObserver(measure)
  if (viewport.value) resizeObserver.observe(viewport.value)
  if (inspector.value) resizeObserver.observe(inspector.value)
  const tools = viewport.value?.querySelector('[role="toolbar"]')
  if (tools) resizeObserver.observe(tools)
  measure()
})
onBeforeUnmount(() => resizeObserver?.disconnect())
watch([modelView, () => props.ui.showShortcuts, () => props.ui.orientation], measure, {
  flush: 'post'
})
const sideGap = computed(() => Math.max(8, props.board.bounds.width * 0.15))
const visibleSides = computed(() => (showBoth.value ? ['front', 'back'] : [side.value]))
const activateSide = (face: string, event: PointerEvent) => {
  if (event.button !== 0 || active.value === 'hand') return
  if (side.value !== face) side.value = face
}
const viewBox = computed(() => {
  const b = props.board.bounds
  const a = area.value
  const width = showBoth.value ? b.width * 2 + sideGap.value : b.width
  const height = b.height + (showBoth.value ? sideGap.value : 0)
  const scale =
    Math.max(
      0.001,
      Math.min(Math.max(1, a.right - a.left) / width, Math.max(1, a.height - 48) / height)
    ) *
    0.95 *
    zoom.value
  const x = b.x + width / 2 - (a.left + a.right) / 2 / scale + pan.value.x
  const y = b.y + b.height / 2 - a.height / 2 / scale + pan.value.y
  return `${x} ${y} ${a.width / scale} ${a.height / scale}`
})
const drag = ref<{ x: number; y: number; scale: number; pointerId: number; buttons: number }>()
const canvasCursor = computed(() => {
  if (drag.value) return 'cursor-grabbing'
  if (active.value === 'hand') return 'cursor-grab'
  if (active.value === 'paint' || active.value === 'text') return 'cursor-crosshair'
  return 'cursor-default'
})
const stop = () => {
  drag.value = undefined
  marquee.cancel()
  holdingMiddle.value = false
}
onMounted(() => window.addEventListener('blur', stop))
onBeforeUnmount(() => {
  window.removeEventListener('blur', stop)
  stop()
})
const start = (event: PointerEvent) => {
  if (event.button === 0 && ['select', 'directSelect'].includes(active.value)) {
    marquee.start(event)
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
  marquee.move(event)
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
onMounted(() => {
  editorState.viewport.value = {
    fit,
    zoomBy: changeZoom,
    focus: (target) => {
      modelView.value = false
      const b = props.board.bounds,
        width = showBoth.value ? b.width * 2 + sideGap.value : b.width
      const cx =
        target.side === 'back'
          ? 2 * b.x +
            b.width -
            target.x -
            target.width / 2 +
            (showBoth.value ? b.width + sideGap.value : 0)
          : target.x + target.width / 2
      zoom.value = Math.min(
        10,
        Math.max(
          1,
          Math.min(
            width / Math.max(0.1, target.width * 2),
            b.height / Math.max(0.1, target.height * 2)
          )
        )
      )
      pan.value = { x: cx - b.x - width / 2, y: target.y + target.height / 2 - b.y - b.height / 2 }
    }
  }
})
onBeforeUnmount(() => {
  editorState.viewport.value = null
})
const finishPointer = (event: PointerEvent) => {
  marquee.finish(event)
  stop()
}
const onWheel = (event: WheelEvent) => changeZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1)
const focusCanvas = (event: PointerEvent) => {
  if (
    editorEventTarget(event)?.closest(
      'input, textarea, select, button, a[href], summary, [contenteditable="true"], [role="option"], [role="combobox"], [role="listbox"]'
    )
  )
    return
  editorRoot.value?.focus({ preventScroll: true })
}
</script>

<template>
  <section
    part="canvas"
    ref="editorRoot"
    tabindex="0"
    @pointerdown.capture="focusCanvas"
    class="relative flex min-h-0 w-full flex-1 flex-col gap-4"
    aria-label="Board workspace"
  >
    <div
      ref="viewport"
      class="relative min-h-128 min-w-0 flex-1 overflow-hidden md:min-h-0"
    >
      <CanvasTools
        :tools="ui.tools"
        :orientation="ui.orientation"
        :show-shortcuts="ui.showShortcuts"
        v-if="!canvasOnly && !modelView"
        class="absolute left-5 top-24 z-10"
      />
      <LivePaintControls
        :presets="ui.presets"
        :custom-colors="ui.customColors"
        :show-paint-target="ui.showPaintTarget"
        v-if="!canvasOnly && !modelView && compactLayout && active === 'paint'"
        compact
        class="absolute left-20 top-4 z-10"
      />
      <PaintCursor v-if="!modelView && active === 'paint'" />
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
        @pointerup="finishPointer"
        @pointercancel="stop"
        @lostpointercapture="stop"
        @auxclick.middle.prevent
        @wheel.prevent="onWheel"
      >
        <g
          v-for="(face, index) in visibleSides"
          :key="face"
          :data-board-side="face"
          :data-active-side="face === side"
          :transform="`translate(${index * (board.bounds.width + sideGap)} 0)`"
          @pointerdown.capture="activateSide(face, $event)"
        >
          <text
            v-if="showBoth"
            :x="board.bounds.x + board.bounds.width / 2"
            :y="board.bounds.y - sideGap / 3"
            text-anchor="middle"
            :fill="face === side ? 'var(--ink)' : 'var(--muted)'"
            :font-size="sideGap / 3"
          >
            {{ face === 'front' ? 'Front' : 'Back' }}
          </text>
          <BoardFace
            :board="board"
            :side="face"
            :background="maskColor"
            :silk="silk"
            :fabrication="components"
            :interactive="face === side"
            :painting="active === 'paint'"
            @error="graphicError = $event"
          />
        </g>
        <rect
          v-if="marquee.bounds.value"
          data-selection-marquee
          :x="marquee.bounds.value.x"
          :y="marquee.bounds.value.y"
          :width="marquee.bounds.value.width"
          :height="marquee.bounds.value.height"
          fill="#4f87ff"
          fill-opacity="0.08"
          stroke="#4f87ff"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
          pointer-events="none"
        />
      </svg>
      <BoardModelPreview
        v-if="modelView"
        ref="modelPreview"
        :class="{ 'md:right-84': !canvasOnly }"
        :board="board"
        :artwork="items"
        :side="side"
        :silk="silk"
        :background="maskColor"
        :fabrication="components"
      />
    </div>
    <div
      v-if="!canvasOnly"
      ref="inspector"
      class="mx-4 flex min-h-0 md:pointer-events-none md:absolute md:bottom-0 md:right-4 md:top-0 md:mx-0 md:w-76"
    >
      <BoardInspector
        :paint-controls="!compactLayout"
        :ui="ui"
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
            :show-view-mode="ui.showViewMode"
            :show-board-side="ui.showBoardSide"
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
