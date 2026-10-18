import { ref, computed } from 'vue'
import { useArtwork } from './useArtwork'
import { useComposition } from '../project/useComposition'
import { captureLibrarySnapshot, placeLibraryRevision, expandLibraryInstance, assertArtworkCapacity, listLibraryAssets, saveLibraryAsset, deleteLibraryAsset, type LibraryAsset } from '../../utils/library'
import { isArtworkLocked } from '../../utils/artwork'
export const useLibrary = () => {
  const { items, selection, selectionIds, checkpoint } = useArtwork()
  const { board } = useComposition()
  const assets = ref<LibraryAsset[]>([]), error = ref(''), busy = ref(false)
  const selectedInstance = computed(() => items.value.find(item => item.id === selection.value && item.library))
  const run = async (action: () => Promise<void>) => {
    if (busy.value) return
    busy.value = true; error.value = ''
    try { await action() } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Library operation failed.' } finally { busy.value = false }
  }
  const refresh = () => run(async () => { assets.value = await listLibraryAssets() })
  const save = (name: string, ids = selectionIds.value, asset?: LibraryAsset) => run(async () => {
    if (!name.trim()) throw new Error('Name this composition first.')
    const snapshot = await captureLibrarySnapshot(items.value, ids), now = Date.now()
    const next: LibraryAsset = asset ? { ...asset, updatedAt: Math.max(now, asset.updatedAt + 1), revisions: [...asset.revisions, { id: crypto.randomUUID(), createdAt: now, snapshot }] } : { version: 1, id: crypto.randomUUID(), name: name.trim().slice(0, 200), createdAt: now, updatedAt: now, revisions: [{ id: crypto.randomUUID(), createdAt: now, snapshot }] }
    await saveLibraryAsset(next, asset?.revisions.at(-1)?.id, asset?.updatedAt)
    assets.value = await listLibraryAssets()
  })
  const rename = (asset: LibraryAsset, name: string) => run(async () => {
    if (!name.trim()) throw new Error('Name this composition first.')
    await saveLibraryAsset({ ...asset, name: name.trim().slice(0, 200), updatedAt: Math.max(Date.now(), asset.updatedAt + 1) }, asset.revisions.at(-1)?.id, asset.updatedAt)
    assets.value = await listLibraryAssets()
  })
  const remove = (asset: LibraryAsset) => run(async () => { await deleteLibraryAsset(asset); assets.value = await listLibraryAssets() })
  const place = (asset: LibraryAsset, linked: boolean) => run(async () => {
    const startingBoard = board.value, startingItems = items.value
    if (!startingBoard) return
    const b = startingBoard.bounds
    const placed = await placeLibraryRevision(asset, linked, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    if (board.value !== startingBoard || items.value !== startingItems) throw new Error('The project changed. Try placing the composition again.')
    assertArtworkCapacity([...items.value, ...placed]); checkpoint(); items.value = [...items.value, ...placed]; selection.value = placed[0]?.id ?? null
  })
  const detach = () => run(async () => {
    const wrapper = selectedInstance.value
    if (!wrapper) return
    if (items.value.some(item => item.library?.instanceId === wrapper.library!.instanceId && isArtworkLocked(items.value, item.id))) throw new Error('Unlock this composition before detaching it.')
    const expanded = expandLibraryInstance(wrapper)
    const next = items.value.flatMap(item => item.library?.instanceId === wrapper.library!.instanceId ? expanded.filter(member => member.side === item.side) : [item])
    assertArtworkCapacity(next); checkpoint(); items.value = next; selection.value = expanded.find(item => !item.kind)?.id ?? null
  })
  const update = (asset: LibraryAsset) => run(async () => {
    const wrapper = selectedInstance.value, original = items.value
    if (!wrapper || wrapper.library!.assetId !== asset.id) throw new Error('Select this linked instance again.')
    if (original.some(item => item.library?.instanceId === wrapper.library!.instanceId && isArtworkLocked(original, item.id))) throw new Error('Unlock this composition before updating it.')
    const placed = await placeLibraryRevision(asset, true)
    if (items.value !== original || selectedInstance.value !== wrapper || original.some(item => item.library?.instanceId === wrapper.library!.instanceId && isArtworkLocked(original, item.id))) throw new Error('The project changed. Preview the update again.')
    const scale = wrapper.width / wrapper.library!.snapshot.bounds.width
    const replacements = placed.map(item => ({ ...item, id: original.find(old => old.library?.instanceId === wrapper.library!.instanceId && old.side === item.side)?.id ?? item.id, library: { ...item.library!, instanceId: wrapper.library!.instanceId }, width: item.width * scale, height: item.height * scale, x: wrapper.x + wrapper.width / 2 - item.width * scale / 2, y: wrapper.y + wrapper.height / 2 - item.height * scale / 2, rotation: wrapper.rotation, visible: wrapper.visible }))
    const previousSides = original.filter(item => item.library?.instanceId === wrapper.library!.instanceId).map(item => item.side)
    const remaining = original.flatMap(item => item.library?.instanceId === wrapper.library!.instanceId ? replacements.filter(member => member.side === item.side) : [item])
    remaining.push(...replacements.filter(item => !previousSides.includes(item.side)))
    assertArtworkCapacity(remaining); checkpoint(); items.value = remaining; selection.value = replacements.find(item => item.side === wrapper.side)?.id ?? replacements[0]!.id
  })
  return { assets, error, busy, selectedInstance, refresh, save, rename, remove, place, detach, update }
}
