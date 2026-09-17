import type { BoardPackage } from '~/utils/boardPackage'

export const useComposition = () => {
  const board = useState<BoardPackage | undefined>('composition-board', () => undefined)
  const side = useState('composition-side', () => 'front')
  const silk = useState('composition-silk', () => true)
  const maskColor = useState('composition-mask', () => '#202723')
  const components = useState('composition-fabrication', () => false)
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
