import { createApp, effectScope, ref, watch } from 'vue'
import { createEditorState, editorStateKey } from '../../../apps/web/app/composables/editor/editorState'
import { useArtwork } from '../../../apps/web/app/composables/artwork/useArtwork'
import { useComposition } from '../../../apps/web/app/composables/project/useComposition'
import { readArtwork } from '../../../apps/web/app/utils/artwork'
import { parseProject, validateProjectBoard, assertProjectSize, type Composition } from '../../../apps/web/app/utils/project'
import { importBoardFile } from '../../../apps/web/app/utils/importBoardFile'
import ImportWorker from '../../../apps/web/app/workers/kicadImport?worker&inline'
import type { BoardPackage } from '../../../apps/web/app/utils/boardPackage'

export type EditorDocument = Composition
export type EditorOptions = { side?: 'front' | 'back'; mask?: string }
export interface EditorController {
  getDocument(): EditorDocument
  subscribe(listener: () => void): () => void
  loadBoard(file: File): Promise<void>
  replaceBoard(board: BoardPackage): void
  restore(document: EditorDocument): Promise<void>
  addGraphic(file: File): Promise<void>
  undo(): void
  redo(): void
  setSide(side: 'front' | 'back'): void
  destroy(): void
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const sessions = new WeakMap<EditorController, ReturnType<typeof initialize>>()
const initialize = (board: BoardPackage, options: EditorOptions) => {
  board = copy(board)
  validateProjectBoard(board)
  assertProjectSize(JSON.stringify({ board }))
  if (options.mask && !/^#[\da-f]{6}$/i.test(options.mask)) throw new Error('Invalid mask color.')
  if (options.side && !['front', 'back'].includes(options.side)) throw new Error('Invalid board side.')
  const state = createEditorState()
  const context = createApp({})
  context.provide(editorStateKey, state)
  const scope = effectScope()
  const data = scope.run(() => context.runWithContext(() => ({ artwork: useArtwork(), composition: useComposition() })))!
  data.composition.openBoard(copy(board))
  data.composition.maskColor.value = options.mask || '#161616'
  data.composition.side.value = options.side || 'front'
  return { id: Symbol('editor-session'), state, scope, ...data, alive: ref(true), mounted: false }
}
export const editorSession = (controller: EditorController) => {
  const session = sessions.get(controller)
  if (!session?.alive.value) throw new Error('This editor has been disposed.')
  return session
}
export const createEditor = (board: BoardPackage, options: EditorOptions = {}): EditorController => {
  const session = initialize(board, options)
  const { composition: c, artwork: a } = session
  const listeners = new Set<() => void>()
  let request: AbortController | undefined
  let generation = 0
  const live = () => { if (!session.alive.value) throw new Error('This editor has been disposed.') }
  const reset = () => { request?.abort(); generation++ }
  const controller: EditorController = {
    getDocument() {
      live()
      return copy({ version: 1, board: c.board.value!, artwork: a.items.value, side: c.side.value,
        silk: c.silk.value, mask: c.maskColor.value, fabrication: c.components.value })
    },
    subscribe(listener) { live(); listeners.add(listener); return () => { listeners.delete(listener) } },
    async loadBoard(file) {
      live(); reset()
      const currentGeneration = generation
      const current = new AbortController(); request = current
      const next = await importBoardFile(file, current.signal, () => new ImportWorker())
      if (current.signal.aborted || !session.alive.value || generation !== currentGeneration) return
      c.openBoard(next); c.maskColor.value = options.mask || '#161616'
    },
    replaceBoard(next) {
      live(); validateProjectBoard(next); assertProjectSize(JSON.stringify({ board: next }))
      const bounds = c.board.value!.bounds
      if (['x','y','width','height'].some(key => bounds[key as keyof typeof bounds] !== next.bounds[key as keyof typeof bounds]))
        throw new Error('Board refresh requires the same coordinate bounds. Load a new board to reset artwork.')
      reset(); c.board.value = copy(next)
    },
    async restore(document) {
      live(); const nextGeneration = ++generation
      const parsed = await parseProject(JSON.stringify(document))
      if (!session.alive.value || generation !== nextGeneration) return
      request?.abort(); a.reset(); c.board.value = parsed.board; a.items.value = parsed.artwork
      c.side.value = parsed.side; c.silk.value = parsed.silk; c.maskColor.value = parsed.mask; c.components.value = parsed.fabrication
    },
    async addGraphic(file) {
      live(); const current = generation
      const graphic = await readArtwork(file)
      if (!session.alive.value || current !== generation) return
      if (!a.canAdd.value) throw new Error('This project already has 100 layers, folders, and graphics.')
      const b = c.board.value!.bounds
      const width = Math.min(b.width * .5, b.height * .5 * graphic.ratio)
      const height = width / graphic.ratio
      const id = crypto.randomUUID()
      a.checkpoint()
      a.items.value.push({ id, name: file.name, source: graphic.source, side: c.side.value,
        parentId: a.destination(c.side.value), x: b.x + (b.width-width)/2, y: b.y + (b.height-height)/2,
        width, height, rotation: 0, visible: true })
      a.selection.value = id
    },
    undo() { live(); a.undo() }, redo() { live(); a.redo() },
    setSide(side) { live(); if (!['front','back'].includes(side)) throw new Error('Invalid board side.'); c.side.value = side },
    destroy() { if (!session.alive.value) return; reset(); listeners.clear(); session.alive.value = false; session.scope.stop() },
  }
  sessions.set(controller, session)
  session.scope.run(() => watch([a.items, c.board, c.side, c.silk, c.maskColor, c.components], () => {
    for (const listener of listeners) listener()
  }, { deep: true }))
  return controller
}
