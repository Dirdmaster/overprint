import { artworkRows, artworkCount, MAX_ARTWORK_ITEMS, readArtwork, type Artwork } from './artwork'
import { parseProject, assertProjectSize } from './project'
import { openWorkspaceDatabase } from './workspaceStore'
export type LibraryBounds = { x: number; y: number; width: number; height: number }
export type LibrarySnapshot = { artwork: Artwork[]; bounds: LibraryBounds }
export type LibraryLink = { instanceId: string; assetId: string; revisionId: string; snapshot: LibrarySnapshot }
export type LibraryRevision = { id: string; createdAt: number; snapshot: LibrarySnapshot }
export type LibraryAsset = { version: 1; id: string; name: string; createdAt: number; updatedAt: number; revisions: LibraryRevision[] }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 100000
const syntheticBoard = { name: 'Library validation', bounds: { x: 0, y: 0, width: 1, height: 1 }, outline: 'M0 0L1 0L1 1Z', holes: '', layers: {} }
export const validateLibrarySnapshot = async (value: LibrarySnapshot): Promise<LibrarySnapshot> => {
  if (!value || !value.bounds || !['x', 'y', 'width', 'height'].every(key => number(value.bounds[key as keyof LibraryBounds])) || value.bounds.width <= 0 || value.bounds.height <= 0 || !Array.isArray(value.artwork) || !value.artwork.length || value.artwork.some(item => !item || item.nativeSilk || item.library)) throw new Error('Invalid library snapshot.')
  const parsed = await parseProject(JSON.stringify({ version: 1, board: syntheticBoard, artwork: value.artwork, side: 'front', silk: false, mask: '#000000', fabrication: false }))
  if (!parsed.artwork.some(item => !item.kind)) throw new Error('A library composition needs a graphic.')
  const snapshot = { bounds: { ...value.bounds }, artwork: parsed.artwork }
  for (const side of ['front', 'back']) await snapshotSvg(snapshot, side)
  return snapshot
}
export const parseLibraryAsset = async (value: unknown): Promise<LibraryAsset> => {
  if (!value || typeof value !== 'object') throw new Error('Invalid library asset.')
  assertProjectSize(JSON.stringify(value))
  const asset = clone(value) as LibraryAsset
  if (!asset || asset.version !== 1 || !identifier(asset.id) || !identifier(asset.name) || !Number.isSafeInteger(asset.createdAt) || asset.createdAt < 0 || !Number.isSafeInteger(asset.updatedAt) || asset.updatedAt < asset.createdAt || !Array.isArray(asset.revisions) || !asset.revisions.length || asset.revisions.length > 100) throw new Error('Invalid library asset.')
  const ids = new Set<string>()
  for (const revision of asset.revisions) {
    if (!revision || !identifier(revision.id) || ids.has(revision.id) || !Number.isSafeInteger(revision.createdAt) || revision.createdAt < 0) throw new Error('Invalid library revision.')
    ids.add(revision.id)
    revision.snapshot = await validateLibrarySnapshot(revision.snapshot)
  }
  return asset
}
export const validateLibraryInstances = async (items: Artwork[]) => {
  const groups = new Map<string, Artwork[]>()
  for (const item of items) {
    const link = item.library
    if (link === undefined) continue
    if (!link || item.kind || item.nativeSilk || item.parentId !== undefined || !identifier(link.instanceId) || !identifier(link.assetId) || !identifier(link.revisionId)) throw new Error('Invalid linked composition.')
    groups.set(link.instanceId, [...(groups.get(link.instanceId) ?? []), item])
  }
  for (const group of groups.values()) {
    const first = group[0]!
    const link = first.library!
    const snapshot = await validateLibrarySnapshot(link.snapshot)
    const sides = ['front', 'back'].filter(side => snapshot.artwork.some(item => item.side === side && !item.kind))
    if (group.length !== sides.length || !sides.every(side => group.filter(item => item.side === side).length === 1)) throw new Error('Incomplete linked composition.')
    if (Math.abs(first.width / first.height - snapshot.bounds.width / snapshot.bounds.height) > 1e-6) throw new Error('Linked compositions require uniform scaling.')
    for (const item of group) {
      if (JSON.stringify(item.library) !== JSON.stringify(link) || !['x', 'y', 'width', 'height', 'rotation', 'visible'].every(key => item[key as keyof Artwork] === first[key as keyof Artwork])) throw new Error('Inconsistent linked composition.')
      // Canonical rendering prevents a stale or forged source diverging from its editable snapshot.
      item.source = await snapshotSvg(snapshot, item.side)
    }
  }
}
const boundsOf = (items: Artwork[]): LibraryBounds => {
  const points = items.filter(item => !item.kind).flatMap(item => {
    const cx = item.x + item.width / 2, cy = item.y + item.height / 2
    const radians = item.rotation * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians)
    return [-1, 1].flatMap(x => [-1, 1].map(y => ({ x: cx + c * x * item.width / 2 - s * y * item.height / 2, y: cy + s * x * item.width / 2 + c * y * item.height / 2 })))
  })
  if (!points.length) throw new Error('Select at least one graphic.')
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y))
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y }
}
export const remapArtwork = (items: Artwork[]) => {
  const ids = new Map(items.map(item => [item.id, crypto.randomUUID()]))
  return clone(items).map(item => ({ ...item, id: ids.get(item.id)!, parentId: item.parentId ? ids.get(item.parentId) : undefined }))
}
export const expandLibraryInstance = (wrapper: Artwork): Artwork[] => {
  const { snapshot } = wrapper.library!
  const b = snapshot.bounds, scale = wrapper.width / b.width
  const radians = wrapper.rotation * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians)
  return remapArtwork(snapshot.artwork).map(item => {
    if (item.kind) return { ...item, visible: item.visible && wrapper.visible }
    const dx = (item.x + item.width / 2 - b.x - b.width / 2) * scale
    const dy = (item.y + item.height / 2 - b.y - b.height / 2) * scale
    const width = item.width * scale, height = item.height * scale
    return { ...item, width, height, x: wrapper.x + wrapper.width / 2 + c * dx - s * dy - width / 2, y: wrapper.y + wrapper.height / 2 + s * dx + c * dy - height / 2, rotation: item.rotation + wrapper.rotation, visible: item.visible && wrapper.visible }
  })
}
export const captureLibrarySnapshot = async (items: Artwork[], selectedIds: string[]): Promise<LibrarySnapshot> => {
  const selected = new Set(selectedIds)
  const addChildren = (id: string) => { for (const item of items.filter(item => item.parentId === id)) { selected.add(item.id); addChildren(item.id) } }
  for (const id of selectedIds) addChildren(id)
  const captured: Artwork[] = []
  const instances = new Set<string>()
  for (const item of items.filter(item => selected.has(item.id) && !item.nativeSilk)) {
    if (item.library) {
      if (!instances.has(item.library.instanceId)) captured.push(...expandLibraryInstance(item))
      instances.add(item.library.instanceId)
    } else {
      let visible = item.visible, parent = items.find(value => value.id === item.parentId)
      while (parent) { if (!selected.has(parent.id)) visible &&= parent.visible; parent = items.find(value => value.id === parent!.parentId) }
      captured.push({ ...clone(item), visible })
    }
  }
  const remapped = remapArtwork(captured)
  return validateLibrarySnapshot({ artwork: remapped, bounds: boundsOf(remapped) })
}
export const snapshotSvg = async (snapshot: LibrarySnapshot, side: string): Promise<string> => {
  const b = snapshot.bounds
  const doc = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg')
  const root = doc.documentElement
  root.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`)
  const frame = doc.createElementNS(root.namespaceURI, 'g')
  if (side === 'back') frame.setAttribute('transform', `translate(${2 * b.x + b.width} 0) scale(-1 1)`)
  root.appendChild(frame)
  let index = 0
  for (const { item, visible } of artworkRows(snapshot.artwork, side, true)) {
    if (item.kind || !visible) continue
    const svg = new DOMParser().parseFromString(item.source, 'image/svg+xml').documentElement
    // Each original document has its own identifier namespace.
    const prefix = `member${index++}-`
    for (const node of [svg, ...svg.querySelectorAll('*')]) {
      if (node.hasAttribute('id')) node.setAttribute('id', prefix + node.getAttribute('id'))
      for (const attr of [...node.attributes]) attr.value = attr.value.replace(/url\(#([\w-]+)\)/g, `url(#${prefix}$1)`)
    }
    svg.setAttribute('x', String(item.x)); svg.setAttribute('y', String(item.y))
    svg.setAttribute('width', String(item.width)); svg.setAttribute('height', String(item.height))
    const g = doc.createElementNS(root.namespaceURI, 'g')
    g.setAttribute('transform', `rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})${side === 'back' ? ` translate(${2 * item.x + item.width} 0) scale(-1 1)` : ''}`)
    g.appendChild(doc.importNode(svg, true)); frame.appendChild(g)
  }
  return (await readArtwork(new File([new XMLSerializer().serializeToString(root)], 'composition.svg'))).source
}
export const placeLibraryRevision = async (asset: LibraryAsset, linked: boolean, point?: { x: number; y: number }): Promise<Artwork[]> => {
  const revision = asset.revisions.at(-1)!, snapshot = revision.snapshot, b = snapshot.bounds
  const x = point ? point.x - b.width / 2 : b.x, y = point ? point.y - b.height / 2 : b.y
  if (!linked) return remapArtwork(snapshot.artwork).map(item => ({ ...item, x: item.x + x - b.x, y: item.y + y - b.y }))
  const link: LibraryLink = { instanceId: crypto.randomUUID(), assetId: asset.id, revisionId: revision.id, snapshot: clone(snapshot) }
  return Promise.all(['front', 'back'].filter(side => snapshot.artwork.some(item => item.side === side && !item.kind)).map(async side => ({ id: crypto.randomUUID(), name: `${asset.name} (linked)`, side, source: await snapshotSvg(snapshot, side), x, y, width: b.width, height: b.height, rotation: 0, visible: true, library: clone(link) })))
}
export const listLibraryAssets = async (): Promise<LibraryAsset[]> => {
  const db = await openWorkspaceDatabase()
  const values = await new Promise<LibraryAsset[]>((resolve, reject) => { const request = db.transaction('libraries').objectStore('libraries').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
  return Promise.all(values.map(parseLibraryAsset))
}
export const saveLibraryAsset = async (value: LibraryAsset, expectedRevisionId?: string, expectedUpdatedAt?: number): Promise<LibraryAsset> => {
  const asset = await parseLibraryAsset(value), db = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('libraries', 'readwrite'), store = tx.objectStore('libraries')
    let message = 'Could not save the library. Export a backup and try again.'
    const request = store.get(asset.id)
    request.onsuccess = () => {
      try {
      const old = request.result as LibraryAsset | undefined
      if ((old && expectedUpdatedAt !== undefined && old.updatedAt !== expectedUpdatedAt) || old?.revisions.at(-1)?.id !== expectedRevisionId || (old && (old.revisions.length > asset.revisions.length || old.revisions.some((revision, index) => JSON.stringify(revision) !== JSON.stringify(asset.revisions[index]))))) { message = 'Library changed in another tab. Reopen the library before saving.'; tx.abort(); return }
      const count = store.count()
      count.onsuccess = () => { try { if (!old && count.result >= 100) { message = 'The local library is limited to 100 compositions.'; tx.abort() } else store.put(asset) } catch { tx.abort() } }
      } catch { tx.abort() }
    }
    tx.oncomplete = () => resolve(asset)
    tx.onabort = () => reject(new Error(message))
  })
}
export const assertArtworkCapacity = (items: Artwork[]) => { if (artworkCount(items) > MAX_ARTWORK_ITEMS) throw new Error('This operation exceeds the project limit of 100 layers, folders, and graphics.') }

export const deleteLibraryAsset = async (asset: LibraryAsset): Promise<void> => {
  const db = await openWorkspaceDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('libraries', 'readwrite'), store = tx.objectStore('libraries')
    const request = store.get(asset.id)
    request.onsuccess = () => {
      try {
        if (request.result?.updatedAt !== asset.updatedAt || request.result?.revisions.at(-1)?.id !== asset.revisions.at(-1)?.id) { tx.abort(); return }
        store.delete(asset.id)
      } catch { tx.abort() }
    }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(new Error('Library changed or could not be deleted. Refresh and try again.'))
  })
}
