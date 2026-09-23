import { useArtwork } from '../artwork/useArtwork'
import { useEditorRef } from '../editor/editorState'
import type { BoardPackage } from '../../utils/boardPackage'

export const useComposition = () => {
  const board = useEditorRef<BoardPackage | undefined>('composition-board', () => undefined)
  const side = useEditorRef('composition-side', () => 'front')
  const silk = useEditorRef('composition-silk', () => true)
  const maskColor = useEditorRef('composition-mask', () => '#202723')
  const components = useEditorRef('composition-fabrication', () => false)
  const { reset } = useArtwork()
  const openBoard = (next: BoardPackage) => {
    reset()
    side.value = 'front'
    silk.value = true
    maskColor.value = '#202723'
    components.value = false
    board.value = next
  }
  return { board, side, silk, maskColor, components, openBoard }
}
