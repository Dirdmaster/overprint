import { useEditorRef } from '../editor/editorState'
import { useComposition } from '../project/useComposition'
import { useArtwork } from './useArtwork'
import { createPrintReport, type PrintFinding } from '../../utils/preflight'
import { watch } from 'vue'
export const usePrintReview = () => {
  const c = useComposition(), a = useArtwork()
  const findings = useEditorRef<PrintFinding[]>('print-findings', () => []), selected = useEditorRef<string|undefined>('print-selected', () => undefined), checked = useEditorRef('print-checked', () => ''), busy = useEditorRef('print-busy', () => false)
  const fingerprint = () => JSON.stringify({ board: c.board.value, artwork: a.items.value })
  const stale = useEditorRef('print-stale', () => false)
  watch([c.board, a.items], () => {
    if (checked.value && !stale.value) stale.value = checked.value !== fingerprint()
  }, { deep: true })
  const run = async () => {
    if (!c.board.value || busy.value) return
    busy.value = true
    const signature = fingerprint(), project = JSON.parse(JSON.stringify({ version: 1, board: c.board.value, artwork: a.items.value, side: c.side.value, silk: c.silk.value, mask: c.maskColor.value, fabrication: c.components.value }))
    try { const result = await createPrintReport(project); if (fingerprint() !== signature) throw new Error('Artwork changed during review. Run the checks again.'); findings.value = result.findings; checked.value = signature; stale.value = false; return result }
    finally { busy.value = false }
  }
  return { findings, selected, checked, busy, stale, run }
}
