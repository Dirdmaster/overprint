<script setup lang="ts">
import { shallowRef, ref } from 'vue'
import { Editor } from '@overprint/editor/vue'
import type { BoardPackage, EditorController } from '@overprint/editor'
defineProps<{ board: BoardPackage }>()
const editor = shallowRef<EditorController>()
const status = ref('')
const load = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    await editor.value!.loadBoard(file)
    status.value = 'Board loaded locally'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Import failed'
  }
  input.value = ''
}
</script>
<template>
  <section>
    <label class="host-actions">
      Load your PCB
      <input
        type="file"
        accept=".kicad_pcb"
        :disabled="!editor"
        @change="load"
      />
    </label>
    <output aria-live="polite">{{ status }}</output>
    <Editor
      :board="board"
      @ready="editor = $event"
    />
  </section>
</template>
