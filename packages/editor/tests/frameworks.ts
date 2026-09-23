import { createElement as h, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorRoot, Canvas, Toolbar, Layers, useEditor, useEditorState } from '../dist/react.js'
const board = { name: 'Framework test', bounds: { x: 0, y: 0, width: 40, height: 30 }, outline: 'M0 0 L40 0 L40 30 L0 30 Z', holes: '', layers: { 'front-silkscreen': [], 'front-mask': [], 'front-copper': [], 'front-fabrication': [], 'back-silkscreen': [], 'back-mask': [], 'back-copper': [], 'back-fabrication': [] } }
const controls: any[] = []
let changes = 0
let app: ReturnType<typeof createRoot>
let currentBoard = board
const Custom = () => {
  const editor = useEditor()
  const state = useEditorState()
  return h('button', { onClick: () => editor.setTool('paint') }, `Custom ${state.tool}`)
}
const render = (grid = true) => app.render(h(StrictMode, null, h(EditorRoot, { board: currentBoard, onReady: (editor: any) => controls.push(editor), onChange: () => changes++ }, h(Custom), h(Toolbar, { orientation: 'horizontal' }), h(Canvas, { grid }), h(Layers))))
const mount = () => { app = createRoot(document.querySelector('#host')!); render() }
mount()
Object.assign(window, { adapter: { controls, render, unmount: () => app.unmount(), mount, changes: () => changes, replace: () => { currentBoard = { ...board, name: 'Replacement' }; render() } } })
