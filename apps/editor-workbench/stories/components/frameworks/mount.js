import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createApp, h, shallowRef } from 'vue'
import ReactPart from './ReactPart'
import VuePart from './OverprintPart.client.vue'
import { mountPart } from './vanilla'

export const mountFrameworkPart = (framework, host, board, part, options, preview) => {
  if (framework === 'javascript') return mountPart(host, board, part, options, preview)
  if (framework === 'react' || framework === 'next') {
    const app = createRoot(host)
    const update = options => app.render(createElement(ReactPart, { board, part, options, preview }))
    update(options)
    return { update, destroy: () => app.unmount() }
  }
  const props = shallowRef(options)
  const app = createApp({ render: () => h(VuePart, { board, part, options: props.value, preview }) })
  app.mount(host)
  return { update: options => { props.value = options }, destroy: () => app.unmount() }
}
