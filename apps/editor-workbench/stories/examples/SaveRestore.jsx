'use client'

import React from 'react'
import { EditorRoot, EditorSurface, useEditorHistory } from '@overprint/editor/react'

const CheckpointControls = () => {
  const { checkpoint, restore, canRestore, pending, error } = useEditorHistory()
  return (
    <>
      <nav className="host-actions">
        <button
          disabled={pending}
          onClick={checkpoint}
        >
          Save checkpoint
        </button>
        <button
          disabled={!canRestore}
          onClick={restore}
        >
          Restore checkpoint
        </button>
      </nav>
      {error && <p role="alert">{error}</p>}
    </>
  )
}

export default function SaveRestore({ board }) {
  return (
    <EditorRoot board={board}>
      <CheckpointControls />
      <EditorSurface />
    </EditorRoot>
  )
}
