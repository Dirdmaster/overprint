import { parseProject, type Composition } from '../project'
import { openWorkspaceDatabase, type WorkspaceProjectRecord } from '../workspaceStore'
import { layoutPanel, MAX_PANEL_COPIES, MAX_PANEL_DESIGNS, ROTATIONS, type PanelPlacement } from './panelLayout'

export const MAX_SAVED_PANELS = 100
const MAX_PANEL_BYTES = 80_000_000

export type PinnedDesign = Pick<WorkspaceProjectRecord, 'id' | 'name' | 'revision' | 'composition'> & { quantity: number }
export type PanelDesign = { record: PinnedDesign; project: Composition }
export type PanelRecord = {
  version: 1
  id: string
  name: string
  revision: number
  updatedAt: number
  rows: number
  columns: number
  gap: number
  stackupConfirmed: boolean
  designs: PinnedDesign[]
  placements: PanelPlacement[]
}

export const pinDesign = async (record: PinnedDesign): Promise<PanelDesign> => {
  const project = await parseProject(record.composition)
  const { id, name, revision, composition, quantity } = record
  return { record: { id, name, revision, composition, quantity }, project }
}

const identifier = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0

export const readPanel = async (value: unknown): Promise<{ record: PanelRecord; designs: PanelDesign[] }> => {
  const panel = value as PanelRecord
  if (!panel || panel.version !== 1 || !identifier(panel.id) || !identifier(panel.name) ||
      !positiveInteger(panel.revision) || !Number.isSafeInteger(panel.updatedAt) || panel.updatedAt < 0 ||
      !positiveInteger(panel.rows) || panel.rows > MAX_PANEL_COPIES || typeof panel.stackupConfirmed !== 'boolean' ||
      !Array.isArray(panel.designs) || !panel.designs.length || panel.designs.length > MAX_PANEL_DESIGNS ||
      !Array.isArray(panel.placements) || !panel.placements.length || panel.placements.length > MAX_PANEL_COPIES) {
    throw new Error('Invalid saved panel.')
  }
  const ids = new Set<string>()
  let bytes = 0
  const encoder = new TextEncoder()
  const designs: PanelDesign[] = []
  for (const design of panel.designs) {
    if (!design || !identifier(design.id) || ids.has(design.id) || !identifier(design.name) ||
        !positiveInteger(design.revision) || !positiveInteger(design.quantity) ||
        typeof design.composition !== 'string') throw new Error('Invalid pinned PCB design.')
    bytes += encoder.encode(design.composition).byteLength
    if (bytes > MAX_PANEL_BYTES) throw new Error('This panel exceeds the 80 MB local snapshot limit.')
    ids.add(design.id)
    designs.push(await pinDesign(design))
  }
  const expected = layoutPanel(designs.map(({ project, record }) => ({
    bounds: project.board.bounds,
    quantity: record.quantity,
  })), { columns: panel.columns, gap: panel.gap })
  if (panel.designs.length === 1 && panel.rows * panel.columns !== panel.designs[0]!.quantity) {
    throw new Error('Saved panel rows and columns do not match the copy count.')
  }
  if (expected.length !== panel.placements.length || panel.placements.some((placement, i) =>
    !placement || placement.source !== expected[i]!.source || !ROTATIONS.includes(placement.rotation) ||
    ![placement.x, placement.y].every(n => Number.isFinite(n) && Math.abs(n) < 200_000))) {
    throw new Error('Invalid placement in saved panel.')
  }
  const { id, name, revision, updatedAt, rows, columns, gap, stackupConfirmed } = panel
  return { designs, record: {
    version: 1, id, name, revision, updatedAt, rows, columns, gap, stackupConfirmed,
    designs: designs.map(design => design.record),
    placements: panel.placements.map(({ source, x, y, rotation }) => ({ source, x, y, rotation })),
  } }
}

export type PanelSummary = Pick<PanelRecord, 'id' | 'name' | 'updatedAt'>

export const listPanels = async () => {
  const db = await openWorkspaceDatabase()
  return new Promise<PanelSummary[]>((resolve, reject) => {
    const panels: PanelSummary[] = []
    const request = db.transaction('panels').objectStore('panels').index('gallery').openKeyCursor(null, 'prev')
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) { resolve(panels); return }
      const [updatedAt, name, id] = cursor.key as [number, string, string]
      panels.push({ updatedAt, name, id })
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}

export const loadPanel = async (id: string) => {
  const db = await openWorkspaceDatabase()
  return new Promise<PanelRecord | undefined>((resolve, reject) => {
    const request = db.transaction('panels').objectStore('panels').get(id)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const savePanel = async (panel: PanelRecord) => {
  const { record } = await readPanel({ ...panel, revision: panel.revision + 1, updatedAt: Date.now() })
  const db = await openWorkspaceDatabase()
  return new Promise<PanelRecord>((resolve, reject) => {
    const tx = db.transaction('panels', 'readwrite')
    const store = tx.objectStore('panels')
    let message = 'Could not save the panel in this browser.'
    const write = () => { try { store.put(record, record.id) } catch { tx.abort() } }
    const existing = store.get(record.id)
    existing.onsuccess = () => {
      if ((existing.result?.revision ?? 0) !== panel.revision) {
        message = 'This panel changed in another tab. Reopen it before saving, or save a copy.'
        tx.abort()
        return
      }
      if (existing.result) { write(); return }
      const count = store.count()
      count.onsuccess = () => {
        if (count.result >= MAX_SAVED_PANELS) {
          message = 'This workspace already has 100 saved panels.'
          tx.abort()
        } else write()
      }
    }
    tx.oncomplete = () => resolve(record)
    tx.onabort = () => reject(new Error(message))
  })
}
