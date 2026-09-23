import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createApp, h, shallowRef } from 'vue'
import * as ReactEditor from '@overprint/editor/react'
import * as VueEditor from '@overprint/editor/vue'
import { mountPart } from './vanilla'
export const componentName = (part) =>
  part
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('')

export const mountFrameworkPart = (framework, host, board, part, options, preview) => {
  if (framework === 'javascript') return mountPart(host, board, part, options, preview)
  const name = componentName(part)
  if (framework === 'react' || framework === 'next') {
    const app = createRoot(host)
    const update = (props) =>
      app.render(
        part === 'editor'
          ? createElement(ReactEditor.Editor, { board, ...props })
          : createElement(
              ReactEditor.EditorRoot,
              { board, theme: props.theme, className: 'component-mount' },
              createElement(ReactEditor[name], props),
              preview && createElement(ReactEditor.Canvas)
            )
      )
    update(options)
    return { update, destroy: () => app.unmount() }
  }
  const props = shallowRef(options)
  const app = createApp({
    render: () =>
      part === 'editor'
        ? h(VueEditor.Editor, { board, ...props.value })
        : h(
            VueEditor.EditorRoot,
            { board, theme: props.value.theme, class: 'component-mount' },
            () => [h(VueEditor[name], props.value), preview && h(VueEditor.Canvas)]
          )
  })
  app.mount(host)
  return {
    update: (options) => {
      props.value = options
    },
    destroy: () => app.unmount()
  }
}
