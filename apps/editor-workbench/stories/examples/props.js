import { createEditor } from '@overprint/editor'
import { mountComposedEditor } from './composed'

export const mountConfiguredEditor = (host, board, props) => {
  const controller = createEditor(board)
  const unmount = mountComposedEditor(host, controller)
  const elements = host.querySelectorAll('overprint-toolbar, overprint-palette, overprint-layers, overprint-view-controls, overprint-canvas')
  // Property updates preserve the controller, artwork, selection and history.
  const update = next => elements.forEach(element => Object.assign(element, next))
  update(props)
  return {
    update,
    destroy: () => { unmount(); controller.destroy() },
  }
}
