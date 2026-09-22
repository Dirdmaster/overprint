<script setup lang="ts">
import { onMounted, ref, shallowRef, watch } from 'vue'
import type { BoardPackage, EditorController, EditorDocument } from '@overprint/editor'

const props = defineProps<{ board: BoardPackage }>()
const container = ref<HTMLElement | null>(null)
const controller = shallowRef<EditorController | null>(null)
const saved = shallowRef<EditorDocument | null>(null)
const status = ref('')

onMounted(() => {
  watch(() => props.board, async (board, _previous, onCleanup) => {
    let disposed = false
    let editor: EditorController | undefined
    let element: HTMLElement | undefined
    controller.value = null
    saved.value = null
    status.value = ''
    onCleanup(() => {
      disposed = true
      controller.value = null
      element?.remove()
      editor?.destroy()
    })
    try {
      const { createEditor, registerEditor } = await import('@overprint/editor')
      if (disposed) return
      registerEditor()
      editor = createEditor(board, { mask: '#161616' })
      element = document.createElement('overprint-editor')
      Object.assign(element, { controller: editor })
      container.value!.append(element)
      controller.value = editor
    } catch (error) {
      if (!disposed) status.value = error instanceof Error ? error.message : 'Unable to load editor'
    }
  }, { immediate: true })
})

const save = () => {
  if (!controller.value) return
  saved.value = controller.value.getDocument()
  status.value = 'Saved in host memory'
}
const restore = async () => {
  if (!controller.value || !saved.value) return
  try {
    await controller.value.restore(saved.value)
    status.value = 'Restored from host memory'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Unable to restore document'
  }
}
</script>

<template>
  <section>
    <nav aria-label="Host actions" class="host-actions">
      <button :disabled="!controller" @click="save">Save to host</button>
      <button :disabled="!controller || !saved" @click="restore">Restore host save</button>
    </nav>
    <output aria-live="polite">{{ status }}</output>
    <div ref="container" style="min-height: 44rem" />
  </section>
</template>
