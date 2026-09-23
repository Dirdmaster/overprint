/** Presentation props. Hidden controls do not disable controller actions or shortcuts. */
export type EditorPresentation = {
  tools?: ('select' | 'hand' | 'paint')[]
  orientation?: 'horizontal' | 'vertical'
  showShortcuts?: boolean
  presets?: { name: string; color: string }[]
  customColors?: boolean
  showPaintTarget?: boolean
  showImport?: boolean
  showNativeLayers?: boolean
  showViewMode?: boolean
  showBoardSide?: boolean
  grid?: boolean
}
