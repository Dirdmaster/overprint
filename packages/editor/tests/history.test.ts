import { describe, expect, test } from 'bun:test'
import { createEditorHistory } from '../src/history'
import type { EditorDocument } from '../src/controller'
const document = (name: string) => ({ artwork: [{ name }] }) as unknown as EditorDocument

describe('editor checkpoints', () => {
  test('shares one checkpoint per controller and captures a detached snapshot', async () => {
    let current = document('first')
    const editor = {
      getDocument: () => structuredClone(current),
      restore: async (value: EditorDocument) => {
        current = structuredClone(value)
        return true
      }
    }
    const history = createEditorHistory(editor)
    expect(createEditorHistory(editor)).toBe(history)
    expect(await history.restore()).toBe(false)
    history.checkpoint()
    current.artwork[0].name = 'edited'
    await history.restore()
    expect(current.artwork[0].name).toBe('first')
    expect(history.getState()).toEqual({ canRestore: true, pending: false, error: null })
  })
  test('coalesces restore, blocks checkpoint while pending and reports failures without losing the checkpoint', async () => {
    let reject!: (error: Error) => void
    let fail = true
    const editor = {
      getDocument: () => document('saved'),
      restore: () =>
        fail
          ? new Promise<boolean>((_, no) => {
              reject = no
            })
          : Promise.resolve(true)
    }
    const history = createEditorHistory(editor)
    history.checkpoint()
    const first = history.restore()
    expect(history.restore()).toBe(first)
    expect(history.checkpoint()).toBe(false)
    expect(history.getState().pending).toBe(true)
    await Promise.resolve()
    reject(new Error('Invalid document'))
    expect(await first).toBe(false)
    expect(history.getState()).toEqual({
      canRestore: true,
      pending: false,
      error: 'Invalid document'
    })
    fail = false
    expect(await history.restore()).toBe(true)
    expect(history.getState().error).toBeNull()
  })
  test('unsubscribe releases observers and checkpoint failure retains the previous snapshot', () => {
    let fail = false
    const history = createEditorHistory({
      getDocument: () => {
        if (fail) throw new Error('Disposed')
        return document('saved')
      },
      restore: async () => true
    })
    let updates = 0
    const unsubscribe = history.subscribe(() => updates++)
    history.checkpoint()
    unsubscribe()
    fail = true
    expect(history.checkpoint()).toBe(false)
    expect(updates).toBe(1)
    expect(history.getState().canRestore).toBe(true)
    expect(history.getState().error).toBe('Disposed')
  })
})
