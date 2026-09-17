import { loadComposition, storeComposition } from '~/utils/compositionStore'
import { parseProject, type Composition } from '~/utils/project'

// Install once at the page root; components only consume the shared state.
export const useProjectStorage = () => {
  const { board, side, silk, maskColor, components } = useComposition()
  const { items, selection, past, future } = useArtwork()
  const status = ref('')
  const key = 'overprint-project-v1'
  let ready = false
  let blocked = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  watch(status, value => {
    clearTimeout(noticeTimer)
    if (value === 'All changes saved' || value === 'Project opened') noticeTimer = setTimeout(() => { status.value = '' }, 3000)
  })
  const snapshot = (): Composition => ({ version: 1, board: board.value!, artwork: items.value, side: side.value, silk: silk.value, mask: maskColor.value, fabrication: components.value })
  const apply = (p: Composition) => {
    board.value = p.board; items.value = p.artwork; side.value = p.side; silk.value = p.silk; maskColor.value = p.mask; components.value = p.fabrication
    selection.value = null; past.value = []; future.value = []
  }
  const save = async (explicit = false) => {
    if (!ready || !board.value || (blocked && !explicit)) return
    clearTimeout(timer)
    try {
      await storeComposition(snapshot())
      blocked = false
      status.value = explicit ? 'All changes saved' : ''
    } catch (error) { status.value = error instanceof Error && error.message.includes('20 MB') ? error.message : 'Could not save locally. Download your project to keep your work.' }
  }
  const open = async (file: File) => {
    try {
      if (file.size > 20_000_000) throw new Error('Project exceeds 20 MB.')
      const project = await parseProject(await file.text())
      apply(project); status.value = 'Project opened'
    } catch (error) { status.value = `Could not open project. ${error instanceof Error ? error.message : ''}` }
  }
  const download = () => {
    if (!board.value) return
    const text = JSON.stringify(snapshot())
    if (new Blob([text]).size > 20_000_000) { status.value = 'Project exceeds the 20 MB file limit. Remove or simplify graphics before downloading.'; return }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `${board.value.name}.overprint`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const keyboard = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(true) }
  }
  const flush = () => save()
  onMounted(async () => {
    window.addEventListener('keydown', keyboard)
    window.addEventListener('pagehide', flush)
    try {
      const text = await loadComposition() ?? localStorage.getItem(key)
      if (text) apply(await parseProject(text))
    } catch { blocked = true; status.value = 'Saved project could not be restored. It has been kept untouched. Open a project file, or press Cmd/Ctrl+S to replace it with your current work.' }
    ready = true
    if (board.value && !blocked) void save()
  })
  watch([board, items, side, silk, maskColor, components], () => {
    if (!ready || blocked) return
    clearTimeout(timer); timer = setTimeout(() => save(), 250)
  }, { deep: true })
  onBeforeUnmount(() => { save(); clearTimeout(timer); clearTimeout(noticeTimer); window.removeEventListener('keydown', keyboard); window.removeEventListener('pagehide', flush) })
  return { status, open, download, save }
}
