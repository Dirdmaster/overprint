import { createApp, h } from 'vue'
import React, { useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { registerEditor } from '@overprint/editor'
registerEditor()
export const editorElement = controller => {
  const element = document.createElement('overprint-editor')
  element.controller = controller
  return element
}
const ReactEditor = ({ controller }) => {
  const node = useRef(null)
  useLayoutEffect(() => {
    const element = editorElement(controller)
    node.current.append(element)
    return () => element.remove()
  }, [controller])
  return React.createElement('div', { ref: node })
}
export const mountEditor = (framework, target, controller) => {
  if (framework === 'react') {
    const app = createRoot(target)
    app.render(React.createElement(ReactEditor, { controller }))
    return () => app.unmount()
  }
  if (framework === 'vue') {
    const app = createApp({ render: () => h('overprint-editor', { controller }) })
    app.mount(target)
    return () => app.unmount()
  }
  const element = editorElement(controller)
  target.append(element)
  return () => element.remove()
}
