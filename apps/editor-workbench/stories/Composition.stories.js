import { createEditor } from '@overprint/editor'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createApp, h } from 'vue'
import { addons, useEffect } from 'storybook/preview-api'
import { SNIPPET_RENDERED } from 'storybook/internal/docs-tools'
import { makeBoard } from './fixture'
import ReactEditor from './examples/ComposedEditor'
import VueEditor from './examples/ComposedEditor.vue'
import react from './examples/ComposedEditor.jsx?raw'
import vue from './examples/ComposedEditor.vue?raw'
import toolbar from './examples/CustomToolbar.vue?raw'
import { mountComposedEditor } from './examples/composed'
import javascript from './examples/composed.js?raw'
import css from './examples/composed.css?raw'
let current
export default {
  title: 'Customization',
  args: { theme: 'light', customToolbar: false },
  argTypes: {
    theme: { control: 'inline-radio', options: ['light', 'dark'] },
    customToolbar: { control: 'boolean' }
  },
  beforeEach: () => () => current?.(),
  render: (args, context) => {
    const framework = context.globals.framework || 'next'
    const family =
      framework === 'javascript'
        ? 'javascript'
        : ['react', 'next'].includes(framework)
          ? 'react'
          : 'vue'
    const code =
      family === 'react'
        ? react
        : family === 'vue'
          ? `<!-- ComposedEditor.vue -->\n${vue}\n\n<!-- CustomToolbar.vue -->\n${toolbar}`
          : `${javascript}\n\nimport { createEditor } from '@overprint/editor'\nconst controller = createEditor(board)\nconst unmount = mountComposedEditor(host, controller, ${JSON.stringify(args)})\n// On teardown: unmount(); controller.destroy()`
    const source = `${code}\n\n/* composed.css */\n${css}`
    useEffect(() => {
      const frame = requestAnimationFrame(() =>
        addons
          .getChannel()
          .emit(SNIPPET_RENDERED, {
            id: context.id,
            source,
            format: family === 'vue' ? 'html' : 'jsx'
          })
      )
      return () => cancelAnimationFrame(frame)
    }, [context.id, source])
    current?.()
    const root = document.createElement('div')
    const board = makeBoard()
    if (family === 'react') {
      const app = createRoot(root)
      app.render(createElement(ReactEditor, { board, ...args }))
      current = () => app.unmount()
    } else if (family === 'vue') {
      const app = createApp({ render: () => h(VueEditor, { board, ...args }) })
      app.mount(root)
      current = () => app.unmount()
    } else {
      const controller = createEditor(board)
      const unmount = mountComposedEditor(root, controller, args)
      current = () => {
        unmount()
        controller.destroy()
      }
    }
    return root
  }
}
export const RearrangedParts = {}
export const CustomToolbar = { args: { customToolbar: true } }
