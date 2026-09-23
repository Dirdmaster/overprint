import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createApp, h } from 'vue'
import { addons, useEffect } from 'storybook/preview-api'
import { SNIPPET_RENDERED } from 'storybook/internal/docs-tools'
import { makeBoard } from './fixture'
import { recipes } from './recipes'
import { mountRecipe } from './examples/recipe'
import javascript from './examples/recipe.js?raw'
import './style.css'
let current
export default {
  title: 'Integration',
  parameters: { controls: { disable: true } },
  beforeEach: () => () => current?.destroy(),
  render: ({ mode }, context) => {
    const framework = context.globals.framework || 'next'
    const family =
      framework === 'javascript'
        ? 'javascript'
        : ['react', 'next'].includes(framework)
          ? 'react'
          : 'vue'
    const recipe = recipes[mode]
    const source =
      family === 'javascript'
        ? `${javascript}\n\nconst dispose = mountRecipe(host, board, '${mode}', nextBoard)\n// On teardown: dispose()`
        : recipe[`${family}Source`]
    useEffect(() => {
      const frame = requestAnimationFrame(() =>
        addons.getChannel().emit(SNIPPET_RENDERED, {
          id: context.id,
          source,
          format: family === 'vue' ? 'html' : 'jsx'
        })
      )
      return () => cancelAnimationFrame(frame)
    }, [context.id, source])
    current?.destroy()
    const root = document.createElement('div')
    const props = { board: makeBoard(), nextBoard: makeBoard() }
    if (family === 'react') {
      const app = createRoot(root)
      app.render(createElement(recipe.react, props))
      current = { destroy: () => app.unmount() }
    } else if (family === 'vue') {
      const app = createApp({ render: () => h(recipe.vue, props) })
      app.mount(root)
      current = { destroy: () => app.unmount() }
    } else current = { destroy: mountRecipe(root, props.board, mode, props.nextBoard) }
    return root
  }
}
export const SaveAndRestore = {
  args: { mode: 'save' },
  parameters: {
    docs: {
      description: {
        story:
          'One checkpoint in memory. useEditorHistory handles snapshots, pending state and errors. This does not persist data to storage.'
      }
    }
  }
}
export const LoadBoard = { args: { mode: 'load' } }
export const RefreshBoard = { args: { mode: 'refresh' } }
