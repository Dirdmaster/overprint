<script setup lang="ts">
import { shallowRef, ref } from 'vue'
import { Editor } from '@overprint/editor/vue'
import type { BoardPackage, EditorController, EditorDocument } from '@overprint/editor'
defineProps<{ board: BoardPackage }>()
const editor = shallowRef<EditorController>()
const saved = shallowRef<EditorDocument>()
const status = ref('')
const ready = (controller: EditorController) => {
  editor.value = controller
  saved.value = undefined
}
const save = () => {
  saved.value = editor.value!.getDocument()
  status.value = 'Saved in host memory'
}
const restore = async () => {
  try {
    await editor.value!.restore(saved.value!)
    status.value = 'Restored from host memory'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Restore failed'
  }
}
</script>

<template>
  <section>
    <nav class="host-actions">
      <button
        :disabled="!editor"
        @click="save"
      >
        Save to host
      </button>
      <button
        :disabled="!editor || !saved"
        @click="restore"
      >
        Restore host save
      </button>
    </nav>
    <output aria-live="polite">{{ status }}</output>
    <Editor
      :board="board"
      @ready="ready"
    />
  </section>
</template>
