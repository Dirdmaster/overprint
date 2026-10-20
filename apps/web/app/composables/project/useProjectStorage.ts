import { loadComposition } from '~/utils/compositionStore'
import { parseProject, type Composition } from '~/utils/project'
import { createProject, migrateLegacyProject, deleteProject, getWorkspaceMeta, listProjects, loadProject, projectThumbnail, saveProject, setWorkspaceMeta, type WorkspaceProjectRecord } from '~/utils/workspaceStore'

// Install once at the page root; all switches pass through the serialized save queue.
export const useProjectStorage = () => {
  const { board, side, silk, maskColor, components, generation } = useComposition()
  const { items, selection, past, future } = useArtwork()
  const status = ref('')
  const projects = ref<WorkspaceProjectRecord[]>([])
  const active = ref<WorkspaceProjectRecord>()
  const busy = ref(false)
  const initialized = ref(false)
  let applying = false
  let blocked = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue = Promise.resolve(true)
  let leavingAfterSave = false
  const refresh = async () => { projects.value = (await listProjects()).sort((a, b) => b.updatedAt - a.updatedAt) }
  const snapshot = (): Composition => JSON.parse(JSON.stringify({ version: 1, board: board.value!, artwork: items.value, side: side.value, silk: silk.value, mask: maskColor.value, fabrication: components.value }))
  const apply = (p: Composition) => {
    applying = true
    board.value = p.board; items.value = p.artwork; side.value = p.side; silk.value = p.silk; maskColor.value = p.mask; components.value = p.fabrication
    selection.value = null; past.value = []; future.value = []
    applying = false
  }
  const report = (error: unknown) => { status.value = error instanceof Error ? error.message : 'Could not save locally. Download your project to keep your work.' }
  const save = (explicit = false): Promise<boolean> => {
    clearTimeout(timer)
    if (!initialized.value || !board.value) return queue
    if (blocked) return Promise.resolve(false)
    const value = snapshot()
    const identity = active.value?.id
    const boardGeneration = generation.value
    queue = queue.then(async () => {
      try {
        if (blocked) return false
        if (generation.value !== boardGeneration) return false
        if (identity && active.value?.id !== identity) return true
        const record = active.value
        active.value = record ? await saveProject({ ...record, composition: JSON.stringify(value), thumbnail: projectThumbnail(value) }, record.revision) : await createProject(value.board.name, value)
        await setWorkspaceMeta('activeProjectId', active.value.id)
        await refresh()
        if (explicit) status.value = 'All changes saved'
        return true
      } catch (error) { blocked = true; report(error); return false }
    })
    return queue
  }
  const leaveSaved = async () => {
    if (!(await save())) return false
    leavingAfterSave = true
    return true
  }
  const activate = async (record: WorkspaceProjectRecord) => {
    const value = await parseProject(record.composition)
    await setWorkspaceMeta('activeProjectId', record.id)
    active.value = record; blocked = false; apply(value)
  }
  const openSaved = async (id: string) => {
    if (busy.value) return false
    busy.value = true
    try {
      if (!(await save())) return false
      const record = await loadProject(id)
      if (!record) throw new Error('Project no longer exists. Refresh the gallery.')
      await activate(record); status.value = 'Project opened'; return true
    } catch (error) { report(error); return false } finally { busy.value = false }
  }
  const open = async (file: File) => {
    if (busy.value) return
    busy.value = true
    try {
      if (file.size > 20_000_000) throw new Error('Project exceeds 20 MB.')
      const project = await parseProject(await file.text())
      if (!(await save())) return
      const record = await createProject(file.name.replace(/\.overprint$/i, ''), project)
      await activate(record); await refresh(); status.value = 'Project opened'
    } catch (error) { report(error) } finally { busy.value = false }
  }
  const rename = async (id: string, name: string) => {
    try {
      if (!(await save())) return
      const record = await loadProject(id)
      if (!record) return
      const updated = await saveProject({ ...record, name: name.trim().slice(0, 200) || record.name }, record.revision)
      if (active.value?.id === id) active.value = updated
      await refresh()
    } catch (error) { report(error) }
  }
  const duplicate = async (id: string) => {
    try {
      if (!(await save())) return
      const record = await loadProject(id)
      if (record) await createProject(`${record.name} copy`, await parseProject(record.composition))
      await refresh()
    } catch (error) { report(error) }
  }
  const remove = async (id: string) => {
    try {
      if (!(await save())) return
      const record = projects.value.find(p => p.id === id)
      if (!record) return
      await deleteProject(id, record.revision)
      if (active.value?.id === id) {
        active.value = undefined; applying = true; board.value = undefined; items.value = []; selection.value = null; past.value = []; future.value = []; applying = false
        await setWorkspaceMeta('activeProjectId', undefined)
      }
      await refresh()
    } catch (error) { report(error) }
  }
  const recover = async () => {
    if (!board.value) return
    try {
      await queue
      const record = await createProject(`${active.value?.name ?? board.value.name} recovery`, snapshot())
      await activate(record); await refresh(); status.value = 'Recovery copy saved'
    } catch (error) { report(error) }
  }
  const download = () => {
    if (!board.value) return
    const text = JSON.stringify(snapshot())
    if (new Blob([text]).size > 20_000_000) { status.value = 'Project exceeds the 20 MB file limit. Remove or simplify graphics before downloading.'; return }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `${active.value?.name ?? board.value.name}.overprint`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const keyboard = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(true) } }
  const flush = () => { void save() }
  onMounted(async () => {
    window.addEventListener('keydown', keyboard); window.addEventListener('pagehide', flush)
    try {
      await refresh()
      const activeId = await getWorkspaceMeta<string>('activeProjectId')
      let record = activeId ? await loadProject(activeId) : undefined
      // A recovered or imported workspace project takes precedence over untouched legacy data.
      // Malformed legacy input must not trap every subsequent reload in recovery mode.
      if (!record && !(await getWorkspaceMeta<boolean>('legacyMigrated'))) {
        const text = await loadComposition() ?? localStorage.getItem('overprint-project-v1')
        await migrateLegacyProject(text ? await parseProject(text) : undefined)
        const migratedId = await getWorkspaceMeta<string>('activeProjectId')
        record = migratedId ? await loadProject(migratedId) : undefined
      }
      if (record) await activate(record)
      await refresh()
    } catch { blocked = true; status.value = 'Saved project could not be restored. It has been kept untouched. Download your current work or save a recovery copy.' }
    initialized.value = true
  })
  watch(generation, () => { active.value = undefined; blocked = false }, { flush: 'sync' })
  watch([board, items, side, silk, maskColor, components], () => {
    if (!initialized.value || blocked || applying) return
    clearTimeout(timer); timer = setTimeout(() => void save(), 250)
  }, { deep: true, flush: 'sync' })
  onBeforeUnmount(() => { if (!leavingAfterSave) void save(); clearTimeout(timer); window.removeEventListener('keydown', keyboard); window.removeEventListener('pagehide', flush) })
  return { initialized, status, projects, active, busy, refresh, openSaved, rename, duplicate, remove, recover, open, download, save, leaveSaved }
}
