import { useEditorState, type EditorState } from '../editor/editorState'
export type PaintStroke = { id: number; x: number; y: number; changed: boolean; visited: Set<string> }
export type PaintSurface = { contains: (x: number, y: number) => boolean; paintAt: (x: number, y: number, stroke: PaintStroke) => void; refresh: () => void }
const surfaces = new WeakMap<EditorState, Map<symbol, PaintSurface>>()
/** All visible board faces share a stroke/checkpoint, while keeping local geometry. */
export const usePaintSurfaces = () => {
 const state = useEditorState()
 let registry = surfaces.get(state)
 if (!registry) { registry = new Map(); surfaces.set(state, registry) }
 return registry
}
