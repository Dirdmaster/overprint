<script setup lang="ts">
import { useEditor, useEditorState } from '@overprint/editor/vue'
const editor = useEditor()
const state = useEditorState()
const tools = ['select', 'hand', 'paint'] as const
</script>
<template>
  <nav
    class="custom-toolbar"
    aria-label="Custom tools"
  >
    <button
      v-for="tool in tools"
      :key="tool"
      :aria-pressed="state.activeTool === tool"
      @click="editor.setTool(tool)"
    >
      {{ tool }}
    </button>
    <button
      :disabled="!state.canUndo"
      @click="editor.undo()"
    >
      Undo
    </button>
    <button
      :disabled="!state.canRedo"
      @click="editor.redo()"
    >
      Redo
    </button>
  </nav>
</template>
