import { defineCustomElement } from 'vue'
import Editor from './Editor.ce.vue'
import theme from './theme.css?inline'
import messages from '../../../apps/web/i18n/locales/en/editor.json'
export { createEditor } from './controller'
export type { EditorController, EditorDocument, EditorOptions } from './controller'
export type { BoardPackage } from '../../../apps/web/app/utils/boardPackage'
export type { Artwork } from '../../../apps/web/app/utils/artwork'
const styles = theme.replaceAll(':root', ':host').replaceAll('html[data-theme=dark]', ':host([data-theme=dark])').replaceAll('html[data-theme=system]', ':host([data-theme=system])')
/** Call in the browser before mounting <overprint-editor controller={controller}>. */
export const registerEditor = (): void => {
  if (customElements.get('overprint-editor')) return
  customElements.define('overprint-editor', defineCustomElement(Editor, {
    styles: [styles, ...(Editor.styles || [])],
    configureApp(app) {
      app.config.globalProperties.$t = (key: string) => String(key.split('.').reduce<unknown>((value, part) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, messages) ?? key)
    },
  }))
}
