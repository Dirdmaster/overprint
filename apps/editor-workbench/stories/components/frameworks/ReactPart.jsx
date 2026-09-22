'use client'

import React, { useEffect, useRef, useState } from 'react'

// React or Next.js App Router. Pass serializable board data across the server boundary.
export default function OverprintPart({ board, part, options, preview = false }) {
  const host = useRef(null)
  const element = useRef(null)
  const latestOptions = useRef(options)
  const [error, setError] = useState('')
  useEffect(() => {
    latestOptions.current = options
    if (element.current) Object.assign(element.current, options)
  }, [options])
  useEffect(() => {
    let disposed = false
    let controller
    let component
    let canvas
    setError('')
    import('@overprint/editor').then(({ createEditor, registerEditor }) => {
      if (disposed) return
      registerEditor()
      controller = createEditor(board)
      component = document.createElement(`overprint-${part}`)
      Object.assign(component, { controller }, latestOptions.current)
      element.current = component
      host.current.append(component)
      if (preview) {
        canvas = document.createElement('overprint-canvas')
        canvas.controller = controller
        host.current.append(canvas)
      }
    }).catch(error => { if (!disposed) setError(error.message) })
    return () => {
      disposed = true
      element.current = null
      component?.remove()
      canvas?.remove()
      controller?.destroy()
    }
  }, [board, part, preview])
  return <><div ref={host} className="component-mount" />{error && <p role="alert">{error}</p>}</>
}
