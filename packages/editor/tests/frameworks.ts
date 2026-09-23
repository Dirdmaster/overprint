import { createElement as h, StrictMode } from 'react'
import { createApp, defineComponent, h as vh, shallowRef } from 'vue'
import * as VueEditor from '../dist/vue.js'
import { createRoot } from 'react-dom/client'
import { EditorRoot, Canvas, Toolbar, Layers, useEditor, useEditorState } from '../dist/react.js'
const board = { name: 'Framework test', bounds: { x: 0, y: 0, width: 40, height: 30 }, outline: 'M0 0 L40 0 L40 30 L0 30 Z', holes: '', layers: { 'front-silkscreen': [], 'front-mask': [], 'front-copper': [], 'front-fabrication': [], 'back-silkscreen': [], 'back-mask': [], 'back-copper': [], 'back-fabrication': [] } }
const controls: any[] = []
let changes = 0
let app: { unmount: () => void; render?: ReturnType<typeof createRoot>['render'] }
const framework = new URLSearchParams(location.search).get('framework') || 'react'
const vueProps = shallowRef({ board, grid: true, side: 'front', mask: '#161616' })
const VueCustom = defineComponent({ setup() {
  const editor = VueEditor.useEditor()
  const state = VueEditor.useEditorState()
  return () => vh('button', { onClick: () => editor.setTool('paint') }, `Custom ${state.value.tool}`)
} })
let currentBoard = board
const Custom = () => {
  const editor = useEditor()
  const state = useEditorState()
  return h('button', { onClick: () => editor.setTool('paint') }, `Custom ${state.tool}`)
}
const render = (grid = true) => framework === 'vue' ? (vueProps.value = { ...vueProps.value, board: currentBoard, grid }) : app.render!(h(StrictMode, null, h(EditorRoot, { board: currentBoard, onReady: (editor: any) => controls.push(editor), onChange: () => changes++ }, h(Custom), h(Toolbar, { orientation: 'horizontal' }), h(Canvas, { grid }), h(Layers))))
const mount = () => {
  if (framework === 'vue') {
    const vue = createApp({ render: () => vh(VueEditor.EditorRoot, { board: vueProps.value.board, side: vueProps.value.side, mask: vueProps.value.mask, onReady: (editor: any) => controls.push(editor), onChange: () => changes++ }, () => [vh(VueCustom), vh(VueEditor.Toolbar, { orientation: 'horizontal' }), vh(VueEditor.Canvas, { grid: vueProps.value.grid }), vh(VueEditor.Layers)]) })
    app = vue; vue.mount('#host')
  } else app = createRoot(document.querySelector('#host')!)
  render()
}
mount()
Object.assign(window, { adapter: { controls, render, configure: () => { vueProps.value = { ...vueProps.value, side: 'back', mask: '#123456' } }, unmount: () => app.unmount(), mount, changes: () => changes, replace: () => { currentBoard = { ...board, name: 'Replacement' }; render() } } })
