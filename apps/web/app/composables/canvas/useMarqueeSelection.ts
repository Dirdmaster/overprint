import { ref } from 'vue'
import { useArtwork } from '../artwork/useArtwork'
import { useComposition } from '../project/useComposition'
import { artworkRows } from '../../utils/artwork'
import { artworkBounds } from '../../utils/artworkAlignment'
export const useMarqueeSelection = () => {
  const a = useArtwork(), { side } = useComposition()
  const bounds = ref<{x:number;y:number;width:number;height:number}>()
  let gesture: { svg: SVGSVGElement; id: number; screenX: number; screenY: number; start: DOMPoint; matrix: DOMMatrix; boardMatrix: DOMMatrix; initial: string[]; moved: boolean; side: string } | undefined
  const cancel = () => { gesture = undefined; bounds.value = undefined }
  const start = (event: PointerEvent) => {
    const svg = event.currentTarget as SVGSVGElement
    const matrix = svg.getScreenCTM(), face = svg.querySelector(`[data-board-side="${side.value}"] [data-board-coordinates]`) as SVGGraphicsElement | null
    const boardMatrix = face?.getScreenCTM()
    if (!matrix || !boardMatrix) return
    if (face?.closest('[data-board-side]')?.getAttribute('data-active-side') === 'false') {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(boardMatrix.inverse())
      const hit = artworkRows(a.items.value, side.value, true).filter(row => row.visible && !row.locked && !row.item.kind).reverse().find(({ item }) => { const b = artworkBounds(item); return point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height })
      if (hit) { event.preventDefault(); a.select(hit.item.id, event.shiftKey); return }
    }
    gesture = { svg, id:event.pointerId, screenX:event.clientX, screenY:event.clientY, start:new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()), matrix:matrix.inverse(), boardMatrix:boardMatrix.inverse(), initial:event.shiftKey?[...a.selectionIds.value]:[], moved:false, side:side.value }
    event.preventDefault(); svg.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent) => {
    const g = gesture
    if (!g || event.pointerId !== g.id || !(event.buttons & 1)) return
    if (!g.moved && Math.hypot(event.clientX-g.screenX,event.clientY-g.screenY)<3) return
    g.moved = true
    const p = new DOMPoint(event.clientX,event.clientY).matrixTransform(g.matrix)
    bounds.value = { x:Math.min(p.x,g.start.x),y:Math.min(p.y,g.start.y),width:Math.abs(p.x-g.start.x),height:Math.abs(p.y-g.start.y) }
    const first = new DOMPoint(g.screenX,g.screenY).matrixTransform(g.boardMatrix), last = new DOMPoint(event.clientX,event.clientY).matrixTransform(g.boardMatrix)
    const x=Math.min(first.x,last.x),y=Math.min(first.y,last.y),right=Math.max(first.x,last.x),bottom=Math.max(first.y,last.y)
    const ids = artworkRows(a.items.value,g.side,true).filter(row=>row.visible&&!row.locked&&!row.item.kind).filter(({item})=>{const b=artworkBounds(item);return b.x<=right&&b.y<=bottom&&b.x+b.width>=x&&b.y+b.height>=y}).map(({item})=>item.id)
    a.selectMany([...g.initial,...ids])
  }
  const finish = (event?: PointerEvent) => {
    const g=gesture
    if (g && (!event || event.pointerId===g.id)) {
      if (event?.type === 'pointerup' && !g.moved) a.selectMany(g.initial)
      cancel()
    }
  }
  return {bounds,start,move,finish,cancel}
}
