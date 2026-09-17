import { artworkRows, type Artwork } from './artwork'
import type { BoardPackage } from './boardPackage'
import { nativeSilkInks } from './nativeSilk'

// Preview pixels only. Manufacturing uses its independent 1200 DPI ink renderer.
export const boardSurface = async (board: BoardPackage, artwork: Artwork[], side: string, silk: boolean, background: string, fabrication = false) => {
  const { x, y, width, height } = board.bounds
  const canvas = document.createElement('canvas')
  const scale = 2048 / Math.max(width, height)
  canvas.width = Math.max(1, Math.ceil(width * scale)); canvas.height = Math.max(1, Math.ceil(height * scale))
  const context = canvas.getContext('2d')!
  context.scale(canvas.width / width, canvas.height / height); context.translate(-x, -y)
  context.save(); context.clip(new Path2D(board.outline), 'evenodd')
  context.fillStyle = background; context.fillRect(x, y, width, height)
  if (silk) {
    for (const { path, color } of nativeSilkInks(board.layers[`${side}-silkscreen`] ?? [], artwork, side, '#f4f1e8')) {
      context.fillStyle = color; context.fill(new Path2D(path), 'evenodd')
    }
  }
  for (const { item, visible } of artworkRows(artwork, side, true)) {
    if (!visible || item.kind) continue
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.source)}`
    await image.decode()
    context.save()
    context.translate(item.x + item.width / 2, item.y + item.height / 2)
    context.rotate(item.rotation * Math.PI / 180)
    if (side === 'back') context.scale(-1, 1)
    const ratio = Math.min(item.width / image.naturalWidth, item.height / image.naturalHeight)
    const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio
    context.drawImage(image, -w / 2, -h / 2, w, h)
    context.restore()
  }
  context.save()
  context.clip(new Path2D((board.layers[`${side}-mask`] ?? []).join(' ')), 'evenodd')
  context.fillStyle = '#cfac61'
  for (const path of board.layers[`${side}-copper`] ?? []) context.fill(new Path2D(path), 'evenodd')
  context.restore()
  if (fabrication) {
    context.save(); context.globalAlpha = .65; context.fillStyle = '#91a1a8'
    for (const path of board.layers[`${side}-fabrication`] ?? []) context.fill(new Path2D(path), 'evenodd')
    context.restore()
  }
  context.globalCompositeOperation = 'destination-out'
  context.fill(new Path2D(board.holes), 'evenodd')
  context.restore()
  return canvas
}
