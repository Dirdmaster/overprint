'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

// Create the controller in a client host, never pass it across a server boundary.
export function OverprintEditor({ controller }) {
  const container = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setError('')
    let disposed = false
    let element
    import('@overprint/editor').then(({ registerEditor }) => {
      if (disposed) return
      registerEditor()
      element = document.createElement('overprint-editor')
      element.controller = controller
      container.current.append(element)
    }).catch(error => { if (!disposed) setError(error.message) })
    return () => { disposed = true; element?.remove() }
  }, [controller])
  return React.createElement(React.Fragment, null, React.createElement('div', { ref: container }), error && React.createElement('p', { role: 'alert' }, error))
}

export function mount(target, controller) {
  const app = createRoot(target)
  app.render(React.createElement(OverprintEditor, { controller }))
  return () => app.unmount()
}
