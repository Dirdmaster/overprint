'use client'
import React from 'react'
import {
  EditorRoot,
  Canvas,
  Toolbar,
  Layers,
  Properties,
  Palette,
  ViewControls,
  ZoomControls,
  useEditor,
  useEditorState
} from '@overprint/editor/react'
import './composed.css'

const CustomToolbar = () => {
  const editor = useEditor()
  const state = useEditorState()
  return (
    <nav
      className="custom-toolbar"
      aria-label="Custom tools"
    >
      {['select', 'hand', 'paint'].map((tool) => (
        <button
          key={tool}
          aria-pressed={state.activeTool === tool}
          onClick={() => editor.setTool(tool)}
        >
          {tool}
        </button>
      ))}
      <button
        disabled={!state.canUndo}
        onClick={() => editor.undo()}
      >
        Undo
      </button>
      <button
        disabled={!state.canRedo}
        onClick={() => editor.redo()}
      >
        Redo
      </button>
    </nav>
  )
}
export default function ComposedEditor({ board, theme = 'light', customToolbar = false }) {
  return (
    <EditorRoot
      board={board}
      theme={theme}
    >
      <section
        className="composed-editor"
        data-theme={theme}
      >
        <header>
          {customToolbar ? <CustomToolbar /> : <Toolbar orientation="horizontal" />}
          <ViewControls />
        </header>
        <Canvas />
        <aside aria-label="Board settings">
          <Layers />
          <Properties />
        </aside>
        <footer>
          <Palette />
          <ZoomControls />
        </footer>
      </section>
    </EditorRoot>
  )
}
