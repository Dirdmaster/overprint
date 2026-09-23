import type { EditorController, EditorDocument } from './controller'

export type EditorHistoryState = Readonly<{
  canRestore: boolean
  pending: boolean
  error: string | null
}>
export type EditorHistory = {
  checkpoint: () => boolean
  restore: () => Promise<boolean>
  getState: () => EditorHistoryState
  subscribe: (listener: () => void) => () => void
}
type DocumentAccess = Pick<EditorController, 'getDocument' | 'restore'>
const histories = new WeakMap<DocumentAccess, EditorHistory>()

/** One in-memory checkpoint per controller. This does not persist or own the editor. */
export const createEditorHistory = (editor: DocumentAccess): EditorHistory => {
  const existing = histories.get(editor)
  if (existing) return existing
  let saved: EditorDocument | undefined
  let active: Promise<boolean> | undefined
  let state: EditorHistoryState = Object.freeze({ canRestore: false, pending: false, error: null })
  const listeners = new Set<() => void>()
  const update = (pending: boolean, error: string | null = null) => {
    state = Object.freeze({ canRestore: !!saved && !pending, pending, error })
    listeners.forEach((listener) => listener())
  }
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
  const history: EditorHistory = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    checkpoint: () => {
      if (active) return false
      try {
        saved = editor.getDocument()
        update(false)
        return true
      } catch (error) {
        update(false, message(error))
        return false
      }
    },
    restore: () => {
      if (active) return active
      if (!saved) return Promise.resolve(false)
      const document = saved
      // Schedule before notifying observers so reentrant calls join the same operation.
      active = Promise.resolve()
        .then(() => editor.restore(document))
        .then(
          (applied) => {
            active = undefined
            update(false, applied ? null : 'Checkpoint restore was cancelled.')
            return applied
          },
          (error) => {
            active = undefined
            update(false, message(error))
            return false
          }
        )
      update(true)
      return active
    }
  }
  histories.set(editor, history)
  return history
}
