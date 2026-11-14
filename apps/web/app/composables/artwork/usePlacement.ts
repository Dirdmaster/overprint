import { useEditorRef } from '../editor/editorState'
import { useArtwork } from './useArtwork'
import { useComposition } from '../project/useComposition'
import { snapBoardPoint, repeatedArtwork } from '../../utils/placement'
import { assertProjectSize } from '../../utils/project'
export const usePlacement = () => {
  const enabled = useEditorRef('placement-snap', () => false), grid = useEditorRef('placement-grid', () => 1)
  const guide = useEditorRef<{ x: number; y: number; name: string } | undefined>('placement-guide', () => undefined)
  const preview = useEditorRef<ReturnType<typeof repeatedArtwork>>('placement-preview', () => [])
  const previewSource = useEditorRef('placement-preview-source', () => '')
  const a = useArtwork(), { board } = useComposition()
  const snap = (point: { x: number; y: number }, side: string) => {
    if (!enabled.value || !board.value || !Number.isFinite(grid.value) || grid.value <= 0 || grid.value > 100) return point
    const next = snapBoardPoint(point, board.value, side, grid.value); guide.value = next; return next
  }
  const prepareRepeat = (mode: 'line' | 'circle', count: number, dx: number, dy: number, radius: number) => {
    if (a.selectedArtwork.value.some(i => i.library || i.gold)) throw new Error('Detach linked instances and gold artwork before repeating.')
    const next = repeatedArtwork(a.selectedArtwork.value, mode, count, dx, dy, radius)
    if (a.items.value.length + next.length > 100) throw new Error('The preview would exceed 100 artwork items.')
    assertProjectSize(JSON.stringify({ board: board.value, artwork: [...a.items.value, ...next] }))
    preview.value = next
    previewSource.value = JSON.stringify({ board: board.value, artwork: a.items.value })
  }
  const applyRepeat = () => {
    if (!preview.value.length || a.items.value.length + preview.value.length > 100) throw new Error('Preview the repeat before applying it.')
    if (JSON.stringify({ board: board.value, artwork: a.items.value }) !== previewSource.value) { preview.value = []; throw new Error('The project changed. Preview the repeat again before applying it.') }
    a.checkpoint(); a.items.value = [...a.items.value, ...preview.value]; preview.value = []
  }
  return { enabled, grid, guide, preview, snap, prepareRepeat, applyRepeat }
}
