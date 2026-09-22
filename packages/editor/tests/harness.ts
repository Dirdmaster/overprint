import { createEditor, registerEditor } from '../dist/editor.js'
registerEditor()
const board = { name: 'Interaction test', bounds: { x: 0, y: 0, width: 40, height: 30 },
  outline: 'M0 0 L40 0 L40 30 L0 30 Z', holes: '', layers: {
    'front-silkscreen': ['M5 5 L15 5 L15 15 L5 15 Z'], 'front-mask': [], 'front-copper': [], 'front-fabrication': [],
    'back-silkscreen': [], 'back-mask': [], 'back-copper': [], 'back-fabrication': [],
  } }
const controllers = [createEditor(board), createEditor(board)]
for (const controller of controllers) {
  const element = document.createElement('overprint-editor')
  element.controller = controller
  document.querySelector('#editors')!.append(element)
}
Object.assign(window, { controllers })
