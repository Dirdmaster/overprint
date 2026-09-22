import type { EditorController } from './controller'
import type { EditorPresentation } from '../../../apps/web/app/utils/editorPresentation'

export type EditorElement = HTMLElement & EditorPresentation & { controller: EditorController }

declare global {
  interface HTMLElementTagNameMap {
    'overprint-editor': EditorElement
    'overprint-canvas': EditorElement
    'overprint-toolbar': EditorElement
    'overprint-palette': EditorElement
    'overprint-layers': EditorElement
    'overprint-properties': EditorElement
    'overprint-view-controls': EditorElement
    'overprint-zoom-controls': EditorElement
  }
}
