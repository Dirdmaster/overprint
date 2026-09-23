import { createEditor, registerEditor } from '@overprint/editor'

// board is your BoardPackage. Call this when the host element is mounted.
export const mountEditor = (host, board) => {
  registerEditor()
  const controller = createEditor(board)
  const element = document.createElement('overprint-editor')
  element.controller = controller
  host.append(element)
  let saved
  return {
    save: () => { saved = controller.getDocument(); return saved },
    restore: async () => { if (saved) await controller.restore(saved) },
    destroy: () => { element.remove(); controller.destroy() },
  }
}
// Wire save()/restore() to your buttons; call destroy() when the host unmounts.
// This example keeps the document in memory. Persist save()'s result in your own storage.
