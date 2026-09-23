import { createEditor, registerEditor, createEditorHistory } from '../dist/editor.js'
registerEditor()
const board = { name: 'Interaction test', bounds: { x: 0, y: 0, width: 40, height: 30 },
  outline: 'M0 0 L40 0 L40 30 L0 30 Z', holes: '', layers: {
    'front-silkscreen': ['M5 5 L15 5 L15 15 L5 15 Z'], 'front-mask': [], 'front-copper': [], 'front-fabrication': [],
    'back-silkscreen': [], 'back-mask': [], 'back-copper': [], 'back-fabrication': [],
  } }
const controllers = [createEditor(board), createEditor(board)]
const parts = new URLSearchParams(location.search).has('parts')
for (const [index, controller] of controllers.entries()) {
  const names = parts && index === 0
    ? ['toolbar', 'palette', 'layers', 'properties', 'view-controls', 'zoom-controls', 'canvas']
    : ['editor']
  for (const name of names) {
    const element = document.createElement(`overprint-${name}`)
    Object.assign(element, { controller })
    document.querySelector('#editors')!.append(element)
  }
}
if (parts) {
  const style = document.createElement('style')
  style.textContent = `overprint-toolbar { --overprint-accent: #123456; } overprint-toolbar::part(toolbar) { flex-direction: row; }`
  document.head.append(style)
  const button = document.createElement('button')
  button.textContent = 'Custom paint tool'
  button.onclick = () => controllers[0].setTool('paint')
  document.querySelector('#editors')!.prepend(button)
  const output = document.createElement('output')
  output.id = 'custom-state'
  document.body.append(output)
  controllers[0].subscribeState(state => { output.textContent = state.activeTool })
}
Object.assign(window, { controllers, createEditorHistory })
