import React, { useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { registerEditor } from '@overprint/editor'

export function OverprintEditor({ controller }) {
  const container = useRef(null)
  useLayoutEffect(() => {
    registerEditor()
    const element = document.createElement('overprint-editor')
    element.controller = controller
    container.current.append(element)
    return () => element.remove()
  }, [controller])
  return React.createElement('div', { ref: container })
}

export function mount(target, controller) {
  const app = createRoot(target)
  app.render(React.createElement(OverprintEditor, { controller }))
  return () => app.unmount()
}
