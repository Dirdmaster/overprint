import { createEditorState, editorStateKey } from '../composables/editor/editorState'
export default defineNuxtPlugin(app => {
  app.vueApp.provide(editorStateKey, createEditorState(true))
})
