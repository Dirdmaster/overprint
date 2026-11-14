import { useArtwork } from './useArtwork'
import { computed } from 'vue'
import { useCanvasToolState } from '../canvas/useCanvasToolState'
import { artworkPolygons, clipPolygons, renderVector, vectorFromRings, type VectorDefinition } from '../../utils/vectorArtwork'
export const useVectorArtwork = () => {
  const a = useArtwork()
  const { selected } = useCanvasToolState()
  const editingNodes = computed({ get: () => selected.value === 'directSelect', set: (value: boolean) => { selected.value = value ? 'directSelect' : 'select' } })
  const addVector = (side: string, x: number, y: number, definition: VectorDefinition) => {
    if (!a.canAdd.value) throw new Error('The project is limited to 100 artwork items.')
    const rendered = renderVector(definition), id = crypto.randomUUID()
    a.checkpoint(); a.items.value.push({ id, name: 'Vector', side, x, y, rotation: 0, visible: true, parentId: a.destination(side), ...rendered }); a.selection.value = id
    return id
  }
  const updateVector = (id: string, definition: VectorDefinition, record = true) => {
    const rendered = renderVector(definition)
    if (!a.canPatch(id, { source: rendered.source })) throw new Error('Unlock and detach the artwork before editing nodes.')
    if (record) a.checkpoint()
    a.patchItems([{ id, patch: { vector: rendered.vector, source: rendered.source } }])
  }
  const booleanSelection = async (operation: 'union' | 'subtract' | 'intersect') => {
    const selected = [...a.selectedArtwork.value], original = a.items.value
    if (selected.length < 2 || new Set(selected.map(i => i.side)).size !== 1 || selected.some(i => i.library || i.gold || !a.canPatch(i.id, { source: i.source }))) throw new Error('Select at least two unlocked, detached graphics on the same side.')
    const geometry = await Promise.all(selected.map(artworkPolygons))
    if (geometry.some(r => !r.length)) throw new Error('Boolean operations require filled artwork. Convert strokes to filled shapes first.')
    let result = geometry[0]!
    for (const next of geometry.slice(1)) result = clipPolygons(result, next, operation)
    if (a.items.value !== original) throw new Error('Artwork changed while preparing the operation. Try again.')
    const merged = vectorFromRings(result, selected[0]!.side)
    const ids = new Set(selected.map(i => i.id)), first = selected[0]!
    a.checkpoint(); a.items.value = original.flatMap(item => item.id === first.id ? [{ ...first, ...merged, drawing: undefined, text: undefined, name: `${operation} result` }] : ids.has(item.id) ? [] : [item]); a.selection.value = first.id
  }
  return { editingNodes, addVector, updateVector, booleanSelection }
}
