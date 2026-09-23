import type { BoardPackage, EditorController, EditorDocument, EditorOptions, EditorPresentation, EditorPart } from '../index'
import type { EditorElement } from '../elements'
export type Theme = 'light' | 'dark' | 'system'
export type SessionProps = {
  board: BoardPackage
  side?: 'front' | 'back'
  mask?: string
  theme?: Theme
  onReady?: (editor: EditorController) => void
  onChange?: (document: EditorDocument) => void
  onError?: (error: Error) => void
}
export const presentationKeys = ['tools', 'orientation', 'showShortcuts', 'presets', 'customColors', 'showPaintTarget', 'showImport', 'showNativeLayers', 'showViewMode', 'showBoardSide', 'grid'] as const
export const presentation = (props: EditorPresentation): EditorPresentation => Object.fromEntries(presentationKeys.map(key => [key, props[key]]))

/** Cancellation also covers an import finishing after the host has unmounted. */
export const startSession = (board: BoardPackage, options: EditorOptions, ready: (controller: EditorController) => void, error: (error: Error) => void): (() => void) => {
  let disposed = false
  let controller: EditorController | undefined
  import('../index').then(engine => {
    if (disposed) return
    engine.registerEditor()
    controller = engine.createEditor(board, options)
    ready(controller)
  }).catch(value => {
    controller?.destroy()
    if (!disposed) error(value instanceof Error ? value : new Error(String(value)))
  })
  return () => { disposed = true; controller?.destroy() }
}
export const mountPart = (host: HTMLElement, kind: EditorPart, controller: EditorController, props: EditorPresentation, theme: Theme): EditorElement => {
  const element = document.createElement(`overprint-${kind}`) as EditorElement
  Object.assign(element, presentation(props), { controller })
  element.dataset.theme = theme
  host.append(element)
  return element
}
