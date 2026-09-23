import type { PropType } from 'vue'
import type { BoardPackage, EditorPresentation } from '../index'
import type { Theme } from './shared'
export const sessionProps = {
  board: { type: Object as PropType<BoardPackage>, required: true as const },
  theme: { type: String as PropType<Theme>, default: 'system' },
  side: String as PropType<'front' | 'back'>,
  mask: String,
}
const optionalBoolean = { type: Boolean, default: undefined }
export const presentationProps = {
  tools: Array as PropType<EditorPresentation['tools']>,
  orientation: String as PropType<EditorPresentation['orientation']>,
  presets: Array as PropType<EditorPresentation['presets']>,
  showShortcuts: optionalBoolean,
  customColors: optionalBoolean,
  showPaintTarget: optionalBoolean,
  showImport: optionalBoolean,
  showNativeLayers: optionalBoolean,
  showViewMode: optionalBoolean,
  showBoardSide: optionalBoolean,
  grid: optionalBoolean,
}
