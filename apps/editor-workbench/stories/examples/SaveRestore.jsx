'use client'

import React, { useState } from 'react'
import { Editor } from '@overprint/editor/react'

export default function SaveRestore({ board }) {
  const [editor, setEditor] = useState(null)
  const [saved, setSaved] = useState(null)
  const [status, setStatus] = useState('')
  const save = () => {
    setSaved(editor.getDocument())
    setStatus('Saved in host memory')
  }
  const restore = async () => {
    try {
      await editor.restore(saved)
      setStatus('Restored from host memory')
    } catch (error) {
      setStatus(error.message)
    }
  }
  return (
    <section>
      <nav className="host-actions">
        <button
          disabled={!editor}
          onClick={save}
        >
          Save to host
        </button>
        <button
          disabled={!editor || !saved}
          onClick={restore}
        >
          Restore host save
        </button>
      </nav>
      <output aria-live="polite">{status}</output>
      <Editor
        board={board}
        onReady={(controller) => {
          setEditor(controller)
          setSaved(null)
        }}
      />
    </section>
  )
}
