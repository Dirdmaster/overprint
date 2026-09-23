'use client'

import { createContext, createElement as h, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createEditorHistory } from './history'
import type { EditorController, EditorPresentation, EditorPart, EditorViewState } from './index'
import { startSession, mountPart, presentation, presentationKeys, type SessionProps, type Theme } from './adapters/shared'

type LayoutProps = { children?: ReactNode; className?: string; style?: CSSProperties }
export type EditorRootProps = SessionProps & LayoutProps
export type PartProps = EditorPresentation & LayoutProps & { theme?: Theme }
export type EditorProps = EditorRootProps & EditorPresentation
const Context = createContext<{ controller: EditorController; theme: Theme } | null>(null)
const useContextValue = () => {
  const context = useContext(Context)
  if (!context) throw new Error('Editor parts and hooks must be inside EditorRoot.')
  return context
}
/** Available to children of EditorRoot after the browser session is ready. */
export const useEditor = (): EditorController => useContextValue().controller
export const useEditorState = (): EditorViewState => {
  const controller = useEditor()
  const [state, setState] = useState(() => controller.getState())
  useEffect(() => {
    const unsubscribe = controller.subscribeState(setState)
    setState(controller.getState())
    return unsubscribe
  }, [controller])
  return state
}
/** In-memory checkpoint controls shared by children of the same EditorRoot. */
export const useEditorHistory = () => {
  const history = createEditorHistory(useEditor())
  const state = useSyncExternalStore(history.subscribe, history.getState, history.getState)
  return { ...state, checkpoint: history.checkpoint, restore: history.restore }
}
export const EditorRoot = (props: EditorRootProps) => {
  const latest = useRef(props)
  latest.current = props
  const [session, setSession] = useState<{ board: SessionProps['board']; controller: EditorController } | null>(null)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    setSession(null)
    setError(null)
    let unsubscribe: (() => void) | undefined
    const stop = startSession(props.board, { side: latest.current.side, mask: latest.current.mask }, controller => {
      unsubscribe = controller.subscribe(() => latest.current.onChange?.(controller.getDocument()))
      setSession({ board: props.board, controller })
      latest.current.onReady?.(controller)
    }, error => { setError(error); latest.current.onError?.(error) })
    return () => { unsubscribe?.(); stop() }
  }, [props.board])
  const controller = session?.board === props.board ? session.controller : null
  useEffect(() => { if (controller && props.side) controller.setSide(props.side) }, [controller, props.side])
  useEffect(() => { if (controller && props.mask) controller.setMaskColor(props.mask) }, [controller, props.mask])
  return h('div', { className: props.className, style: props.style },
    error ? h('p', { role: 'alert' }, error.message) : controller ? h(Context.Provider, { value: { controller, theme: props.theme || 'system' } }, props.children) : null)
}
const part = (kind: EditorPart) => {
  const Part = (props: PartProps) => {
    const { controller, theme } = useContextValue()
    const host = useRef<HTMLDivElement>(null)
    const element = useRef<ReturnType<typeof mountPart> | null>(null)
    useEffect(() => {
      let disposed = false
      // Custom elements finish disconnecting on a microtask. Also skip Strict Mode's trial mount.
      queueMicrotask(() => { if (!disposed) element.current = mountPart(host.current!, kind, controller, props, props.theme || theme) })
      return () => { disposed = true; element.current?.remove(); element.current = null }
    }, [controller])
    useEffect(() => {
      if (!element.current) return
      Object.assign(element.current, presentation(props))
      element.current.dataset.theme = props.theme || theme
    }, [theme, props.theme, ...presentationKeys.map(key => props[key])])
    return h('div', { ref: host, className: props.className, style: props.style })
  }
  Part.displayName = `Overprint(${kind})`
  return Part
}
export const Canvas = part('canvas')
export const Toolbar = part('toolbar')
export const Palette = part('palette')
export const Layers = part('layers')
export const Properties = part('properties')
export const ViewControls = part('view-controls')
export const ZoomControls = part('zoom-controls')
export const EditorSurface = part('editor')
export const Editor = (props: EditorProps) => h(EditorRoot, props, h(EditorSurface, presentation(props)))
