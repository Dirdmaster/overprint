'use client'
import React, { useState } from 'react'
import { Editor } from '@overprint/editor/react'
export default function RefreshBoard({ board, nextBoard }) {
  const [editor, setEditor] = useState(null)
  const [status, setStatus] = useState('')
  const refresh = () => {
    try {
      editor.replaceBoard(nextBoard)
      setStatus('Geometry refreshed; artwork preserved')
    } catch (error) {
      setStatus(error.message)
    }
  }
  return (
    <section>
      <nav className="host-actions">
        <button
          disabled={!editor}
          onClick={refresh}
        >
          Refresh board geometry
        </button>
      </nav>
      <output aria-live="polite">{status}</output>
      <Editor
        board={board}
        onReady={setEditor}
      />
    </section>
  )
}
