import { createEditor, registerEditor } from '@overprint/editor'

export const mountPart = (host, board, part, options, preview = false) => {
  registerEditor()
  const controller = createEditor(board, { side: options.side })
  const element = document.createElement(`overprint-${part}`)
  Object.assign(element, { controller }, options)
  element.dataset.theme = options.theme || 'system'
  host.append(element)
  let canvas
  if (preview) {
    canvas = document.createElement('overprint-canvas')
    canvas.controller = controller
    host.append(canvas)
  }
  return {
    update: (options) => {
      Object.assign(element, options)
      element.dataset.theme = options.theme || 'system'
      if (options.side) controller.setSide(options.side)
    },
    destroy: () => {
      element.remove()
      canvas?.remove()
      controller.destroy()
    }
  }
}
