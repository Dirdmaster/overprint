<script setup lang="ts">
import { ref } from 'vue'
import { useTextDrawing } from '../../composables/artwork/useTextDrawing'
import { useCanvasToolState } from '../../composables/canvas/useCanvasToolState'
import { defaultText } from '../../utils/textDrawing'
const props = defineProps<{ side: string }>()
const emit = defineEmits<{ error: [message: string] }>()
const { addText } = useTextDrawing()
const { selected } = useCanvasToolState()
const pending = ref(false)
const place = async (event: PointerEvent) => {
  if (event.button !== 0 || pending.value) return
  event.preventDefault()
  event.stopPropagation()
  const matrix = (event.currentTarget as SVGGraphicsElement).getScreenCTM()
  if (!matrix) return
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  pending.value = true
  try {
    const id = await addText(defaultText(), props.side, point.x, point.y)
    if (id) {
      selected.value = 'select'
      emit('error', '')
    }
  } catch (reason) {
    emit('error', reason instanceof Error ? reason.message : 'Unable to create text.')
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <rect
    x="-10000"
    y="-10000"
    width="20000"
    height="20000"
    fill="transparent"
    :class="pending ? 'cursor-wait' : 'cursor-text'"
    @pointerdown="place"
  />
</template>
