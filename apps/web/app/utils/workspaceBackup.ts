import { MAX_SAVED_PANELS, readPanel, type PanelRecord } from './panel/panelStore'
import type { Artwork } from './artwork'
import { parseLibraryAsset, type LibraryAsset, type LibraryLink } from './library'
import { parseProject, type Composition } from './project'
import { MAX_WORKSPACE_PROJECTS, openWorkspaceDatabase, projectThumbnail, type WorkspaceProjectRecord } from './workspaceStore'

const LIMIT = 100_000_000
export type PreparedWorkspaceBackup = { format: 'overprint-workspace'; version: 1; projects: WorkspaceProjectRecord[]; libraries: LibraryAsset[]; panels: PanelRecord[] }
const bounded = (text: string) => { if (new TextEncoder().encode(text).byteLength > LIMIT) throw new Error('Workspace backup exceeds the 100 MB limit.') }
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200
const validate = async (value: unknown): Promise<PreparedWorkspaceBackup> => {
  const backup = value as PreparedWorkspaceBackup
  if (!backup || backup.format !== 'overprint-workspace' || backup.version !== 1 || !Array.isArray(backup.projects) || backup.projects.length > MAX_WORKSPACE_PROJECTS || !Array.isArray(backup.libraries) || backup.libraries.length > 100) throw new Error('Unsupported or oversized workspace backup.')
  const savedPanels = backup.panels === undefined ? [] : backup.panels
  if (!Array.isArray(savedPanels) || savedPanels.length > MAX_SAVED_PANELS) throw new Error('Invalid or oversized panel backup.')
  const panelIds = new Set<string>()
  const panels: PanelRecord[] = []
  const projectIds = new Set<string>(), assetIds = new Set<string>()
  const projects: WorkspaceProjectRecord[] = [], libraries: LibraryAsset[] = []
  for (const record of backup.projects) {
    if (!record || !identifier(record.id) || !identifier(record.name) || !Number.isSafeInteger(record.revision) || record.revision < 1 || !Number.isSafeInteger(record.updatedAt) || record.updatedAt < 0 || typeof record.composition !== 'string') throw new Error('Invalid project in workspace backup.')
    if (projectIds.has(record.id)) throw new Error('Duplicate project in workspace backup.')
    projectIds.add(record.id)
    const composition = await parseProject(record.composition)
    projects.push({ id: record.id, name: record.name, revision: record.revision, updatedAt: record.updatedAt, composition: JSON.stringify(composition), thumbnail: projectThumbnail(composition) })
  }
  for (const value of backup.libraries) {
    const asset = await parseLibraryAsset(value)
    if (assetIds.has(asset.id)) throw new Error('Duplicate library in workspace backup.')
    assetIds.add(asset.id); libraries.push(asset)
  }
  for (const value of savedPanels) {
    const { record } = await readPanel(value)
    if (panelIds.has(record.id)) throw new Error('Duplicate panel in workspace backup.')
    panelIds.add(record.id)
    panels.push(record)
  }
  return { format: 'overprint-workspace', version: 1, projects, libraries, panels }
}
export const exportWorkspaceBackup = async (): Promise<string> => {
  const db = await openWorkspaceDatabase()
  const snapshot = await new Promise<PreparedWorkspaceBackup>((resolve, reject) => {
    const tx = db.transaction(['projects', 'libraries', 'panels'], 'readonly')
    const projects = tx.objectStore('projects').getAll(), libraries = tx.objectStore('libraries').getAll()
    const panels = tx.objectStore('panels').getAll()
    tx.oncomplete = () => resolve({ format: 'overprint-workspace', version: 1, projects: projects.result, libraries: libraries.result, panels: panels.result })
    tx.onabort = () => reject(new Error('Could not read workspace backup. Try again.'))
  })
  // Validate the complete committed snapshot outside its transaction, without mixing revisions.
  const text = JSON.stringify(snapshot)
  bounded(text)
  const validated = JSON.stringify(await validate(snapshot))
  bounded(validated)
  return validated
}
const remapCopies = async (backup: PreparedWorkspaceBackup): Promise<PreparedWorkspaceBackup> => {
  const assets = new Map<string, string>(), revisions = new Map<string, string>()
  const assetId = (id: string) => { if (!assets.has(id)) assets.set(id, crypto.randomUUID()); return assets.get(id)! }
  const revisionId = (asset: string, revision: string) => {
    const key = JSON.stringify([asset, revision])
    if (!revisions.has(key)) revisions.set(key, crypto.randomUUID())
    return revisions.get(key)!
  }
  const remapArtwork = (items: Artwork[]): Artwork[] => {
    const ids = new Map(items.map(item => [item.id, item.nativeSilk ? item.id : crypto.randomUUID()]))
    return items.map(item => ({ ...item, id: ids.get(item.id)!, ...(item.parentId ? { parentId: ids.get(item.parentId) } : {}) }))
  }
  const libraries = backup.libraries.map(asset => ({ ...asset, id: assetId(asset.id), name: `${asset.name} restored`.slice(0, 200), revisions: asset.revisions.map(revision => ({ ...revision, id: revisionId(asset.id, revision.id), snapshot: { ...revision.snapshot, artwork: remapArtwork(revision.snapshot.artwork) } })) }))
  const projects: WorkspaceProjectRecord[] = []
  const projectIds = new Map<string, string>()
  for (const record of backup.projects) {
    const composition = JSON.parse(record.composition) as Composition
    const instances = new Map<string, LibraryLink>()
    composition.artwork = remapArtwork(composition.artwork).map(item => {
      if (!item.library) return item
      const old = item.library
      if (!instances.has(old.instanceId)) instances.set(old.instanceId, { ...old, instanceId: crypto.randomUUID(), assetId: assetId(old.assetId), revisionId: revisionId(old.assetId, old.revisionId), snapshot: { ...old.snapshot, artwork: remapArtwork(old.snapshot.artwork) } })
      return { ...item, library: instances.get(old.instanceId)! }
    })
    const canonical = await parseProject(JSON.stringify(composition))
    const id = crypto.randomUUID()
    projectIds.set(record.id, id)
    projects.push({ id, name: `${record.name} restored`.slice(0, 200), revision: record.revision, updatedAt: Date.now(), composition: JSON.stringify(canonical), thumbnail: projectThumbnail(canonical) })
  }
  const panels = backup.panels.map(panel => ({
    ...panel, id: crypto.randomUUID(), name: `${panel.name} restored`.slice(0, 200), revision: 1, updatedAt: Date.now(),
    designs: panel.designs.map(design => ({ ...design, id: projectIds.get(design.id) ?? design.id })),
  }))
  return { format: 'overprint-workspace', version: 1, projects, libraries, panels }
}
export const prepareWorkspaceRestore = async (file: File): Promise<PreparedWorkspaceBackup> => {
  if (file.size > LIMIT) throw new Error('Workspace backup exceeds the 100 MB limit.')
  const text = await file.text()
  bounded(text)
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('Choose a valid workspace backup JSON file.') }
  return remapCopies(await validate(value))
}
export const restoreWorkspaceBackup = async (prepared: PreparedWorkspaceBackup): Promise<void> => {
  // Revalidate the public boundary before opening a write transaction.
  bounded(JSON.stringify(prepared))
  const backup = await validate(prepared)
  const db = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'libraries', 'panels'], 'readwrite')
    const projects = tx.objectStore('projects'), libraries = tx.objectStore('libraries')
    let message = 'Could not restore the backup. No copies were imported. Free browser storage and try again.'
    const projectCount = projects.count()
    const libraryCount = libraries.count()
    const panels = tx.objectStore('panels')
    const panelCount = panels.count()
    panelCount.onsuccess = () => {
      try {
        if (projectCount.result + backup.projects.length > MAX_WORKSPACE_PROJECTS) { message = 'The workspace is limited to 1000 projects. No copies were imported.'; tx.abort(); return }
        if (libraryCount.result + backup.libraries.length > 100) { message = 'The local library is limited to 100 compositions. No copies were imported.'; tx.abort(); return }
        if (panelCount.result + backup.panels.length > MAX_SAVED_PANELS) { message = 'The workspace is limited to 100 panels. No copies were imported.'; tx.abort(); return }
        for (const panel of backup.panels) panels.add(panel, panel.id)
        for (const project of backup.projects) projects.add(project, project.id)
        for (const asset of backup.libraries) libraries.add(asset)
      } catch { tx.abort() }
    }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(new Error(message))
  })
}
