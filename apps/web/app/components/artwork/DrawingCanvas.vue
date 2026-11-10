<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useCanvasToolState } from '../../composables/canvas/useCanvasToolState'
import { useComposition } from '../../composables/project/useComposition'
import { useDrawing } from '../../composables/artwork/useDrawing'
import { useEditorState, editorOwnsEvent } from '../../composables/editor/editorState'
import { defaultShape, isShapeTool, renderDrawing, type ShapeTool } from '../../utils/drawing'
const props = defineProps<{ side: string }>()
const emit = defineEmits<{ error: [message: string] }>()
const { active, selected } = useCanvasToolState()
const { addShape } = useDrawing()
const editor = useEditorState()
const { board } = useComposition()
const gesture = ref<{
  start: { x: number; y: number }
  end: { x: number; y: number }
  shape: ShapeTool
}>()
let capture: { target: SVGGraphicsElement; id: number; inverse: DOMMatrix } | undefined
const cancel = () => {
  const old = capture
  capture = undefined
  gesture.value = undefined
  if (old?.target.hasPointerCapture(old.id)) old.target.releasePointerCapture(old.id)
}
const drawing = computed(() => {
  const g = gesture.value
  if (!g) return
  const width = Math.abs(g.end.x - g.start.x),
    height = Math.abs(g.end.y - g.start.y)
  if (g.shape === 'line' ? Math.hypot(width, height) < 0.05 : width < 0.05 || height < 0.05) return
  const definition = defaultShape(g.shape, width, height)
  definition.lineReverse =
    (g.end.x - g.start.x) * (g.end.y - g.start.y) < 0 !== (props.side === 'back')
  const rendered = renderDrawing(definition)
  const padding = definition.stroke === 'none' ? 0 : definition.strokeWidth / 2
  return {
    ...rendered,
    x: Math.min(g.start.x, g.end.x) - padding,
    y: Math.min(g.start.y, g.end.y) - padding
  }
})
const start = (event: PointerEvent) => {
  if (event.button !== 0 || !isShapeTool(active.value)) return
  event.stopPropagation()
  event.preventDefault()
  const target = event.currentTarget as SVGGraphicsElement
  const matrix = target.getScreenCTM()
  if (!matrix) return
  capture = { target, id: event.pointerId, inverse: matrix.inverse() }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(capture.inverse)
  gesture.value = {
    start: {
      x: Math.max(-4000, Math.min(4000, point.x)),
      y: Math.max(-4000, Math.min(4000, point.y))
    },
    end: {
      x: Math.max(-4000, Math.min(4000, point.x)),
      y: Math.max(-4000, Math.min(4000, point.y))
    },
    shape: active.value
  }
  target.setPointerCapture(event.pointerId)
}
const move = (event: PointerEvent) => {
  if (!capture || capture.id !== event.pointerId || !gesture.value) return
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(capture.inverse)
  gesture.value.end = {
    x: Math.max(-4000, Math.min(4000, point.x)),
    y: Math.max(-4000, Math.min(4000, point.y))
  }
}
const finish = (event: PointerEvent) => {
  if (!capture || capture.id !== event.pointerId) return
  move(event)
  const result = drawing.value
  cancel()
  if (!result) return
  try {
    addShape(result.drawing, props.side, result.x, result.y)
    selected.value = 'select'
    emit('error', '')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : 'Unable to draw shape.')
  }
}
const escape = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && editorOwnsEvent(editor, event)) cancel()
}
watch([active, () => props.side, board], cancel)
onMounted(() => {
  window.addEventListener('keydown', escape)
  window.addEventListener('blur', cancel)
})
onBeforeUnmount(() => {
  cancel()
  window.removeEventListener('keydown', escape)
  window.removeEventListener('blur', cancel)
})
</script>
<template>
  <g v-if="isShapeTool(active)">
    <rect
      x="-10000"
      y="-10000"
      width="20000"
      height="20000"
      fill="transparent"
      class="cursor-crosshair"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="finish"
      @pointercancel="cancel"
      @lostpointercapture="cancel"
    />
    <image
      v-if="drawing"
      data-drawing-preview
      :href="`data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.source)}`"
      :x="drawing.x"
      :y="drawing.y"
      :width="drawing.width"
      :height="drawing.height"
      :transform="
        side === 'back' ? `translate(${2 * drawing.x + drawing.width} 0) scale(-1 1)` : undefined
      "
      opacity="0.7"
      pointer-events="none"
    />
  </g>
</template>
