import { assertProjectSize, type Composition } from './project'
let connection: Promise<IDBDatabase> | undefined
const database = () => {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('overprint', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('projects')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { connection = undefined; reject(request.error) }
    request.onblocked = () => { connection = undefined; reject(new Error('Project storage is blocked by another tab.')) }
  })
  return connection
}
export const loadComposition = async (): Promise<string | undefined> => {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction('projects').objectStore('projects').get('current')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export const storeComposition = async (value: Composition) => {
  // Serialize Vue's reactive objects before the structured-clone boundary.
  const text = JSON.stringify(value)
  assertProjectSize(text)
  const db = await database()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite')
    transaction.objectStore('projects').put(text, 'current')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Save aborted'))
    transaction.onerror = () => reject(transaction.error)
  })
}
