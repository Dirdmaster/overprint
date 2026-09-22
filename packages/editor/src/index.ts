import { defineCustomElement } from 'vue'
import Editor from './Editor.ce.vue'
import { styles, themeTokens } from './theme'
import { editorParts, editorPartKey } from './parts'
import messages from '../../../apps/web/i18n/locales/en/editor.json'
export { createEditor } from './controller'
export type {
  EditorController,
  EditorDocument,
  EditorOptions,
} from './controller'
export type { BoardPackage } from '../../../apps/web/app/utils/boardPackage'
export type { EditorPart } from './parts'
export type { EditorViewState, EditorTool } from './controls'
export type { Artwork } from '../../../apps/web/app/utils/artwork'
/** Call in the browser before mounting <overprint-editor controller={controller}>. */
export const registerEditor = (): void => {
  for (const kind of editorParts) {
    const name = `overprint-${kind}`
    if (customElements.get(name)) continue
    customElements.define(
      name,
      defineCustomElement(Editor, {
        styles: [styles + themeTokens, ...(Editor.styles || [])],
        configureApp(app) {
          app.provide(editorPartKey, kind)
          app.config.globalProperties.$t = (key: string) =>
            String(
              key
                .split('.')
                .reduce<unknown>(
                  (value, part) =>
                    value && typeof value === 'object'
                      ? (value as Record<string, unknown>)[part]
                      : undefined,
                  messages,
                ) ?? key,
            )
        },
      }),
    )
  }
}

export type { EditorPresentation } from '../../../apps/web/app/utils/editorPresentation'
export type { EditorElement } from './elements'
