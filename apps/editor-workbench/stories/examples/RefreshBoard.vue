<script setup lang="ts">
import { shallowRef, ref } from 'vue'
import { Editor } from '@overprint/editor/vue'
import type { BoardPackage, EditorController } from '@overprint/editor'
const props = defineProps<{ board: BoardPackage; nextBoard: BoardPackage }>()
const editor = shallowRef<EditorController>()
const status = ref('')
const refresh = () => {
  try {
    editor.value!.replaceBoard(props.nextBoard)
    status.value = 'Geometry refreshed; artwork preserved'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Refresh failed'
  }
}
</script>
<template>
  <section>
    <nav class="host-actions">
      <button
        :disabled="!editor"
        @click="refresh"
      >
        Refresh board geometry
      </button>
    </nav>
    <output aria-live="polite">{{ status }}</output>
    <Editor
      :board="board"
      @ready="editor = $event"
    />
  </section>
</template>
