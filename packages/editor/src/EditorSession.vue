<script setup lang="ts">
import { provide, onBeforeUnmount } from 'vue'
import BoardEditor from '../../../apps/web/app/components/editor/BoardEditor.vue'
import { editorStateKey } from '../../../apps/web/app/composables/editor/editorState'
import { editorSession, type EditorController } from './controller'
const props = defineProps<{ controller: EditorController }>()
const session = editorSession(props.controller)
if (session.mounted) throw new Error('Create a separate controller for each mounted editor.')
session.mounted = true
provide(editorStateKey, session.state)
const board = session.composition.board
const alive = session.alive
onBeforeUnmount(() => { session.mounted = false })
</script>
<template>
  <div v-if="alive" class="embedded-editor">
    <BoardEditor v-if="board" :board="board" />
    <footer><a href="https://overprint.ink" target="_blank" rel="noopener noreferrer">Powered by Overprint</a></footer>
  </div>
</template>
<style>
:host { display: block; font-family: Inter, sans-serif; color: var(--ink); }
.embedded-editor { display: flex; flex-direction: column; height: var(--overprint-height, 44rem); min-height: 32rem; background: var(--canvas); }
footer { display: flex; align-items: center; min-height: 2.5rem; padding: 0 1rem; font-size: 0.75rem; color: var(--muted); }
a { color: inherit; }
</style>
