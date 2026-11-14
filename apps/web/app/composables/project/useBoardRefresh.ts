import { useEditorRef } from '../editor/editorState'
import { useComposition } from './useComposition'
import { useArtwork } from '../artwork/useArtwork'
import type { BoardPackage } from '../../utils/boardPackage'
import { parseProject, validateProjectBoard, type Composition } from '../../utils/project'
import { compareBoardRevision } from '../../utils/boardChange'
import { createProject, listProjects, loadProject, type WorkspaceProjectRecord } from '../../utils/workspaceStore'
export const useBoardRefresh = () => {
  const c = useComposition(), a = useArtwork()
  const pending = useEditorRef<{ before: Composition; next: BoardPackage; fingerprint: string; comparison: ReturnType<typeof compareBoardRevision> } | undefined>('refresh-pending', () => undefined)
  const revisions = useEditorRef<WorkspaceProjectRecord[]>('refresh-revisions', () => []), busy = useEditorRef('refresh-busy', () => false), error = useEditorRef('refresh-error', () => '')
  const snapshot = (): Composition => JSON.parse(JSON.stringify({ version: 1, board: c.board.value!, artwork: a.items.value, side: c.side.value, silk: c.silk.value, mask: c.maskColor.value, fabrication: c.components.value, palette: c.palette.value }))
  const refreshRevisions = async () => { revisions.value = (await listProjects()).filter(p => p.name.startsWith('Revision: ')).sort((a, b) => b.updatedAt - a.updatedAt) }
  const stage = (next: BoardPackage) => {
    validateProjectBoard(next)
    if (!c.board.value) { c.openBoard(next); return c.board.value! }
    const before = snapshot()
    pending.value = { before, next, fingerprint: JSON.stringify(before), comparison: compareBoardRevision(before.board, next, before.artwork) }; error.value = ''
    return pending.value.next
  }
  const saveBefore = async (reason: string) => {
    const before = snapshot(), fingerprint = JSON.stringify(before)
    await createProject(`Revision: ${before.board.name} before ${reason}`, before)
    if (JSON.stringify(snapshot()) !== fingerprint) throw new Error('The project changed while saving its revision. Try again.')
  }
  const apply = async () => {
    const plan = pending.value
    if (!plan || busy.value) return
    busy.value = true; error.value = ''
    try {
      if (JSON.stringify(snapshot()) !== plan.fingerprint) throw new Error('The project changed. Cancel and preview the board update again.')
      await saveBefore('PCB refresh')
      if (pending.value !== plan) throw new Error('The board review changed. Try again.')
      c.board.value = plan.next; pending.value = undefined; await refreshRevisions()
    } catch(e) { error.value = e instanceof Error ? e.message : 'Could not apply the PCB update.' }
    finally { busy.value = false }
  }
  const restore = async (id: string) => {
    if (busy.value) return
    busy.value = true; error.value = ''
    try {
      const record = await loadProject(id)
      if (!record) throw new Error('The revision is no longer available.')
      const parsed = await parseProject(record.composition)
      await saveBefore('revision restore')
      a.reset(); c.board.value = parsed.board; a.items.value = parsed.artwork; c.side.value = parsed.side; c.silk.value = parsed.silk; c.maskColor.value = parsed.mask; c.components.value = parsed.fabrication; c.palette.value = parsed.palette ?? []; await refreshRevisions()
    } catch(e) { error.value = e instanceof Error ? e.message : 'Could not restore the revision.' }
    finally { busy.value = false }
  }
  return { pending, revisions, busy, error, stage, apply, restore, refreshRevisions }
}
