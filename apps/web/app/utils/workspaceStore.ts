import { assertProjectSize, type Composition } from './project'
export type WorkspaceProjectRecord = { id: string; name: string; revision: number; updatedAt: number; composition: string; thumbnail: string }
let connection: Promise<IDBDatabase> | undefined
export const openWorkspaceDatabase = (): Promise<IDBDatabase> => connection ??= new Promise((resolve, reject) => {
  const request = indexedDB.open('overprint-workspace', 1)
  request.onupgradeneeded = () => {
    for (const name of ['projects', 'meta']) request.result.createObjectStore(name)
    request.result.createObjectStore('libraries', { keyPath: 'id' })
  }
  request.onsuccess = () => {
    const db = request.result
    db.onversionchange = () => { db.close(); connection = undefined }
    resolve(db)
  }
  request.onerror = () => { connection = undefined; reject(request.error) }
  request.onblocked = () => { connection = undefined; reject(new Error('Close other Overprint tabs to update local storage.')) }
})
const read = async <T>(store: string, key?: string): Promise<T> => {
  const db = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const object = db.transaction(store).objectStore(store)
    const request = key === undefined ? object.getAll() : object.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export const listProjects = () => read<WorkspaceProjectRecord[]>('projects')
export const loadProject = (id: string) => read<WorkspaceProjectRecord | undefined>('projects', id)
export const getWorkspaceMeta = <T>(key: string) => read<T | undefined>('meta', key)
export const setWorkspaceMeta = async (key: string, value: unknown) => {
  const db = await openWorkspaceDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite')
    tx.objectStore('meta').put(value, key)
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted.'))
  })
}
export const projectThumbnail = (project: Composition) => {
  const { bounds, outline } = project.board
  // Board paths are validated on import. A small board silhouette avoids retaining external resources.
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}"><path d="${outline}" fill="${project.mask}"/></svg>`)}`
}
export const saveProject = async (record: WorkspaceProjectRecord, expectedRevision: number): Promise<WorkspaceProjectRecord> => {
  assertProjectSize(record.composition)
  const db = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite')
    const store = tx.objectStore('projects')
    let conflict = false
    const next = { ...record, revision: expectedRevision + 1, updatedAt: Date.now() }
    const request = store.get(record.id)
    request.onsuccess = () => {
      if ((request.result?.revision ?? 0) !== expectedRevision) { conflict = true; tx.abort(); return }
      store.put(next, record.id)
    }
    tx.oncomplete = () => resolve(next)
    tx.onabort = () => reject(new Error(conflict ? 'This project changed in another tab. Download your work, then reopen the saved project, or save a recovery copy.' : 'Could not save locally. Download your project to keep your work.'))
  })
}
export const createProject = (name: string, project: Composition) => saveProject({ id: crypto.randomUUID(), name: name.trim().slice(0, 200) || 'Untitled project', revision: 0, updatedAt: Date.now(), composition: JSON.stringify(project), thumbnail: projectThumbnail(project) }, 0)
export const deleteProject = async (id: string, revision: number) => {
  const db = await openWorkspaceDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite')
    const store = tx.objectStore('projects')
    const request = store.get(id)
    request.onsuccess = () => { if (request.result?.revision !== revision) tx.abort(); else store.delete(id) }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(new Error('Project changed in another tab. Refresh the gallery before deleting.'))
  })
}

// The marker and recovered project commit together. Interrupted or concurrent startup cannot duplicate recovery.
export const migrateLegacyProject = async (project?: Composition) => {
  const db = await openWorkspaceDatabase()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['projects', 'meta'], 'readwrite')
    const meta = tx.objectStore('meta')
    const marker = meta.get('legacyMigrated')
    marker.onsuccess = () => {
      if (marker.result) return
      if (project) {
        const record: WorkspaceProjectRecord = { id: crypto.randomUUID(), name: project.board.name, revision: 1, updatedAt: Date.now(), composition: JSON.stringify(project), thumbnail: projectThumbnail(project) }
        tx.objectStore('projects').put(record, record.id)
        meta.put(record.id, 'activeProjectId')
      }
      meta.put(true, 'legacyMigrated')
    }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('Legacy recovery failed. Original data remains untouched.'))
  })
}
