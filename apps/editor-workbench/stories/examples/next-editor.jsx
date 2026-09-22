'use client'

import React, { useEffect, useRef, useState } from 'react'

// Pass JSON board data from the server, never an editor controller.
export default function NextEditor({ board }) {
  const container = useRef(null)
  const controller = useRef(null)
  const saved = useRef(null)
  const [ready, setReady] = useState(false)
  const [hasSave, setHasSave] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let disposed = false
    let editor
    let element
    setReady(false)
    setHasSave(false)
    saved.current = null
    setStatus('')

    // Import and initialize only in the browser, after hydration.
    import('@overprint/editor').then(({ createEditor, registerEditor }) => {
      if (disposed) return
      registerEditor()
      editor = createEditor(board, { mask: '#161616' })
      element = document.createElement('overprint-editor')
      element.controller = editor
      container.current.append(element)
      controller.current = editor
      setReady(true)
    }).catch(error => {
      if (!disposed) setStatus(error.message)
    })

    return () => {
      disposed = true
      controller.current = null
      element?.remove()
      editor?.destroy()
    }
  }, [board])

  function save() {
    saved.current = controller.current.getDocument()
    setHasSave(true)
    setStatus('Saved in host memory')
  }

  async function restore() {
    try {
      await controller.current.restore(saved.current)
      setStatus('Restored from host memory')
    } catch (error) {
      setStatus(error.message)
    }
  }

  return (
    <section>
      <nav aria-label="Host actions" className="host-actions">
        <button disabled={!ready} onClick={save}>Save to host</button>
        <button disabled={!ready || !hasSave} onClick={restore}>Restore host save</button>
      </nav>
      <output aria-live="polite">{status}</output>
      <div ref={container} style={{ minHeight: '44rem' }} />
    </section>
  )
}
