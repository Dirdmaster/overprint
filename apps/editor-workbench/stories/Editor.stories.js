import { addons, useEffect } from 'storybook/preview-api'
import { SNIPPET_RENDERED } from 'storybook/internal/docs-tools'
import reactCode from './examples/react.js?raw'
import vueCode from './examples/vue.js?raw'
import nuxtCode from './examples/ControlledEditor.client.vue?raw'
import vanillaCode from './examples/vanilla.js?raw'
import scenarioCode from './scenarios.js?raw'
import { scenario } from './scenarios'
import { expect, userEvent, waitFor } from 'storybook/test'
let current
export default {
  title: 'Editor',
  args: { theme: 'light', side: 'front' },
  argTypes: {
    mode: { table: { disable: true } },
    theme: { control: 'inline-radio', options: ['light', 'dark'] },
    side: { control: 'inline-radio', options: ['front', 'back'] },
  },
  beforeEach: () => () => current?.destroy(),
  render: (args, context) => {
    const framework = context.globals.framework || 'next'
    const source = { react: reactCode, next: reactCode, vue: vueCode, nuxt: nuxtCode, javascript: vanillaCode }[framework]
    useEffect(() => {
      const frame = requestAnimationFrame(() => addons.getChannel().emit(SNIPPET_RENDERED, { id: context.id, source: source + '\n\n// Host scenarios (run in the browser):\n' + scenarioCode, format: framework === 'nuxt' ? 'html' : 'javascript' }))
      return () => cancelAnimationFrame(frame)
    }, [context.id, framework])
    current?.destroy()
    current = scenario({ ...args, framework })
    return current.root
  },
}
export const Board = {}
export const ArtworkAndUndo = {
  args: { mode: 'artwork' },
  play: async ({ canvasElement }) => {
    const add = canvasElement.querySelector('nav button')
    await userEvent.click(add)
    await waitFor(() => expect(canvasElement.querySelector('overprint-editor')?.shadowRoot?.querySelector('button')).toBeTruthy())
    const editor = canvasElement.querySelector('overprint-editor').shadowRoot
    const undo = [...editor.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Undo')
    await waitFor(() => expect(undo).toBeEnabled())
    await userEvent.click(undo)
    await waitFor(() => expect(editor.textContent).not.toContain('Overprint.svg'))
    const redo = [...editor.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Redo')
    await userEvent.click(redo)
    await waitFor(() => expect(editor.textContent).toContain('Overprint.svg'))
  },
}
export const HostSaveAndRestore = { args: { mode: 'save' } }
export const BoardRefresh = { args: { mode: 'refresh' } }
export const LoadKiCadBoard = { name: 'Load KiCad Board', args: { mode: 'load' } }
export const IndependentInstances = { args: { mode: 'instances' } }
export const Dark = { args: { theme: 'dark' } }
