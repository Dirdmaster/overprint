import { createApp, h } from 'vue'
import ControlledEditor from './examples/ControlledEditor.client.vue'
import { mount as react } from './examples/react'
import { mount as vue } from './examples/vue'
import { mount as vanilla } from './examples/vanilla'

const nuxt = (target, controller) => {
  const app = createApp({ render: () => h(ControlledEditor, { controller }) })
  app.mount(target)
  return () => app.unmount()
}
const mounts = { react, vue, vanilla, javascript: vanilla, next: react, nuxt }
export const mountEditor = (framework, target, controller) => mounts[framework](target, controller)
