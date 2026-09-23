'use client'
import React, { useState } from 'react'
import { Editor } from '@overprint/editor/react'
export default function LoadBoard({ board }) {
  const [editor, setEditor] = useState(null)
  const [status, setStatus] = useState('')
  const load = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      await editor.loadBoard(file)
      setStatus('Board loaded locally')
    } catch (error) {
      setStatus(error.message)
    }
    event.target.value = ''
  }
  return (
    <section>
      <label className="host-actions">
        Load your PCB{' '}
        <input
          type="file"
          accept=".kicad_pcb"
          disabled={!editor}
          onChange={load}
        />
      </label>
      <output aria-live="polite">{status}</output>
      <Editor
        board={board}
        onReady={setEditor}
      />
    </section>
  )
}
