import { registerEditor } from '@overprint/editor'

export function mount(target, controller) {
  registerEditor()
  const element = document.createElement('overprint-editor')
  element.controller = controller
  target.append(element)
  return () => element.remove()
}
