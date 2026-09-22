<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { BoardPackage, EditorController, EditorPart, EditorPresentation } from '@overprint/editor'

// Vue: import this component. Nuxt: place it in app/components for client-only mounting.
const props = defineProps<{ board: BoardPackage; part: EditorPart; options: EditorPresentation; preview?: boolean }>()
const host = ref<HTMLElement | null>(null)
const error = ref('')
let element: HTMLElement | undefined
watch(() => props.options, options => {
  if (element) Object.assign(element, options)
}, { deep: true })
onMounted(() => {
  watch(() => [props.board, props.part, props.preview] as const, async ([board, part, preview], _previous, onCleanup) => {
    let disposed = false
    let controller: EditorController | undefined
    let component: HTMLElement | undefined
    let canvas: HTMLElement | undefined
    error.value = ''
    onCleanup(() => {
      disposed = true
      element = undefined
      component?.remove()
      canvas?.remove()
      controller?.destroy()
    })
    try {
      const { createEditor, registerEditor } = await import('@overprint/editor')
      if (disposed) return
      registerEditor()
      controller = createEditor(board)
      component = document.createElement(`overprint-${part}`)
      Object.assign(component, { controller }, props.options)
      element = component
      host.value!.append(component)
      if (preview) {
        canvas = document.createElement('overprint-canvas')
        Object.assign(canvas, { controller })
        host.value!.append(canvas)
      }
    } catch (value) {
      if (!disposed) error.value = value instanceof Error ? value.message : 'Unable to mount component'
    }
  }, { immediate: true })
})
</script>
<template>
  <div ref="host" class="component-mount" />
  <p v-if="error" role="alert">{{ error }}</p>
</template>
