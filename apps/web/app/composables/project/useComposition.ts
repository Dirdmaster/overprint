import { useArtwork } from '../artwork/useArtwork'
import { useEditorRef } from '../editor/editorState'
import type { BoardPackage } from '../../utils/boardPackage'
import type { PaletteColor } from '../../utils/artworkAppearance'

export const useComposition = () => {
  const board = useEditorRef<BoardPackage | undefined>('composition-board', () => undefined)
  const side = useEditorRef('composition-side', () => 'front')
  const silk = useEditorRef('composition-silk', () => true)
  const maskColor = useEditorRef('composition-mask', () => '#202723')
  const components = useEditorRef('composition-fabrication', () => false)
  const palette = useEditorRef<PaletteColor[]>('composition-palette', () => [])
  const generation = useEditorRef('composition-generation', () => 0)
  const { reset } = useArtwork()
  const openBoard = (next: BoardPackage) => {
    generation.value++
    reset()
    side.value = 'front'
    silk.value = true
    maskColor.value = '#202723'
    components.value = false
    palette.value = []
    board.value = next
  }
  return { board, side, silk, maskColor, components, palette, openBoard, generation }
}
