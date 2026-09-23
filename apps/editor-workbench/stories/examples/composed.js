import { registerEditor } from '@overprint/editor'
import './composed.css'

// The host owns the controller and destroys it when the whole editor closes.
export function mountComposedEditor(host, controller, { customToolbar = false, theme = 'light' } = {}) {
  registerEditor()
  const root = document.createElement('section')
  root.className = 'composed-editor'
  root.dataset.theme = theme
  const header = document.createElement('header')
  const sidebar = document.createElement('aside')
  sidebar.setAttribute('aria-label', 'Board settings')
  const footer = document.createElement('footer')
  const part = (name, parent) => {
    const element = document.createElement(`overprint-${name}`)
    element.controller = controller
    element.dataset.theme = theme
    parent.append(element)
    return element
  }
  root.append(header)
  const cleanup = []
  if (customToolbar) {
    const toolbar = document.createElement('nav')
    toolbar.className = 'custom-toolbar'
    toolbar.setAttribute('aria-label', 'Custom tools')
    const buttons = new Map()
    const button = (label, action) => {
      const element = document.createElement('button')
      element.textContent = label
      element.onclick = action
      toolbar.append(element)
      return element
    }
    for (const tool of ['select', 'hand', 'paint']) {
      buttons.set(tool, button(tool, () => controller.setTool(tool)))
    }
    const undo = button('Undo', () => controller.undo())
    const redo = button('Redo', () => controller.redo())
    const color = document.createElement('input')
    color.type = 'color'
    color.setAttribute('aria-label', 'Custom paint color')
    color.oninput = () => controller.setPaintColor(color.value)
    toolbar.append(color)
    const update = state => {
      for (const [tool, element] of buttons) element.setAttribute('aria-pressed', String(state.activeTool === tool))
      undo.disabled = !state.canUndo
      redo.disabled = !state.canRedo
      color.value = state.paintColor
    }
    update(controller.getState())
    cleanup.push(controller.subscribeState(update))
    header.append(toolbar)
  } else part('toolbar', header).orientation = 'horizontal'
  part('view-controls', header)
  part('canvas', root)
  part('layers', sidebar)
  part('properties', sidebar)
  root.append(sidebar, footer)
  part('palette', footer)
  part('zoom-controls', footer)
  host.append(root)
  return () => { cleanup.forEach(dispose => dispose()); root.remove() }
}
