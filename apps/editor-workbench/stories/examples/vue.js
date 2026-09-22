import { createApp, h } from 'vue'
import { registerEditor } from '@overprint/editor'

export function mount(target, controller) {
  registerEditor()
  const app = createApp({
    render: () => h('overprint-editor', { controller }),
  })
  app.mount(target)
  return () => app.unmount()
}
