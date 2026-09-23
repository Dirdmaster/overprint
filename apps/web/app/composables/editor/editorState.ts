import { inject, ref, shallowRef, type InjectionKey, type Ref } from 'vue'

export const createEditorState = (globalShortcuts = false) => ({
  globalShortcuts,
  roots: new Set<HTMLElement>(),
  viewport: shallowRef<{ fit: () => void; zoomBy: (factor: number) => void } | null>(null),
  values: new Map<string, Ref>(),
  root: shallowRef<HTMLElement | null>(null),
})
export type EditorState = ReturnType<typeof createEditorState>
export const editorStateKey: InjectionKey<EditorState> = Symbol('overprint-editor')
export const useEditorState = () => {
  const state = inject(editorStateKey)
  if (!state) throw new Error('Overprint editor requires an editor state provider.')
  return state
}
export const useEditorRef = <T>(key: string, initial: () => T): Ref<T> => {
  const state = useEditorState()
  if (!state.values.has(key)) state.values.set(key, ref(initial()))
  return state.values.get(key)! as Ref<T>
}
export const editorOwnsEvent = (state: EditorState, event: Event) =>
  state.globalShortcuts || [state.root.value, ...state.roots].some(root => root && event.composedPath().includes(root))
export const editorEventTarget = (event: Event) =>
  event.composedPath().find(node => node instanceof HTMLElement) as HTMLElement | undefined
