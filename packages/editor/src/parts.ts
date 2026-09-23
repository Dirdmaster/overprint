import type { InjectionKey } from 'vue'
export const editorParts = [
  'editor',
  'canvas',
  'toolbar',
  'palette',
  'layers',
  'properties',
  'view-controls',
  'zoom-controls',
] as const
export type EditorPart = (typeof editorParts)[number]
export const editorPartKey: InjectionKey<EditorPart> = Symbol('overprint-part')
