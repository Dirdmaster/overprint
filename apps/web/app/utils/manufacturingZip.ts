import { zipSync, strToU8, strFromU8 } from 'fflate'
import { artworkRows } from './artwork'
import type { Composition } from './project'
import { validateFabrication } from './fabrication'
import { encryptColorSvg } from './colorEnvelope'
import { withJlcColorHeader } from './gerberCompatibility'
import { nativeSilkInks, hasNativeSilkEdits } from './nativeSilk'

const loadImage = async (source: string) => {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
}

// Rasterize only ink, never the gold/copper preview or fabrication overlay.
export const renderInk = async (project: Composition, side: string, region = project.board.bounds) => {
  const { board } = project
  const { x, y, width, height } = board.bounds
  const scale = 1200 / 25.4
  const pixelWidth = Math.max(1, Math.ceil(region.width * scale))
  const pixelHeight = Math.max(1, Math.ceil(region.height * scale))
  // Never silently lower manufacturing resolution to fit browser memory limits.
  if (Math.max(pixelWidth, pixelHeight) > 8192 || pixelWidth * pixelHeight > 40_000_000) {
    throw new Error('This board exceeds the 1200 DPI color export size limit (8192 pixels per side, 40 megapixels).')
  }
  const canvas = document.createElement('canvas')
  canvas.width = pixelWidth
  canvas.height = pixelHeight
  const ctx = canvas.getContext('2d')!
  ctx.scale(canvas.width / region.width, canvas.height / region.height)
  ctx.translate(-region.x, -region.y)
  ctx.save()
  ctx.clip(new Path2D(board.outline), 'evenodd')
  ctx.fillStyle = project.mask
  ctx.fillRect(x, y, width, height)
  // Match the editor: KiCad silk is the reference beneath user artwork.
  if (project.silk) {
    for (const { path, color } of nativeSilkInks(board.layers[`${side}-silkscreen`] ?? [], project.artwork, side, '#ffffff')) {
      ctx.fillStyle = color; ctx.fill(new Path2D(path), 'evenodd')
    }
  }
  for (const { item, visible } of artworkRows(project.artwork, side, true)) {
    if (!visible || item.kind) continue
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.source)}`)
    ctx.save()
    const cx = item.x + item.width / 2, cy = item.y + item.height / 2
    ctx.translate(cx, cy); ctx.rotate(item.rotation * Math.PI / 180)
    if (side === 'back') ctx.scale(-1, 1)
    // Match SVG image's default preserveAspectRatio="xMidYMid meet".
    const ratio = Math.min(item.width / image.naturalWidth, item.height / image.naturalHeight)
    const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio
    ctx.drawImage(image, -w / 2, -h / 2, w, h)
    ctx.restore()
  }
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fill(new Path2D(board.holes), 'evenodd')
  for (const path of board.layers[`${side}-mask`] ?? []) ctx.fill(new Path2D(path), 'evenodd')
  ctx.restore()
  return canvas.toDataURL('image/png')
}

export const makeManufacturingZip = async (project: Composition) => {
  if (!project.board.fabrication) throw new Error('Re-export this PCB with plugin 0.1.3, then import it again. This board has no Gerbers or drill files.')
  const fabrication = validateFabrication(project.board.fabrication)
  if (![2, 4].includes(fabrication.copperLayers)) throw new Error('The color test currently supports two- and four-layer boards.')
  const files: Record<string, Uint8Array> = Object.fromEntries(Object.entries(fabrication.files).map(([name, text]) => [name.slice(12), strToU8(text)]))
  const { x, y, width: w, height: h } = project.board.bounds
  // Still experimental: these corner marks do not yet match EasyEDA's
  // inset-outline registration. See the authentic export comparison notes.
  const marks = [[x + .0762, -y - h + .0762], [x + .0762, -y - .0762], [x + w - .0762, -y - .0762]]
  const view = [x, y, w, h].map(v => v / .254).join(' ')
  for (const [side, name, suffix] of [['front', 'Top', 'FCTS'], ['back', 'Bottom', 'FCBS']] as const) {
    const scale = 1200 / 25.4
    const pw = Math.ceil(w * scale), ph = Math.ceil(h * scale)
    if (pw * ph > 256_000_000) throw new Error('This board exceeds the 256 megapixel color export limit at 1200 DPI.')
    const tiled = Math.max(pw, ph) > 8192 || pw * ph > 40_000_000
    const columns = tiled ? Math.ceil(pw / 4096) : 1
    const rows = tiled ? Math.ceil(ph / 4096) : 1
    const images: string[] = []
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      // Boundaries share one integer pixel grid, keeping adjacent tiles aligned.
      const left = Math.floor(column * pw / columns), right = Math.floor((column + 1) * pw / columns)
      const top = Math.floor(row * ph / rows), bottom = Math.floor((row + 1) * ph / rows)
      const region = { x: x + left / pw * w, y: y + top / ph * h, width: (right - left) / pw * w, height: (bottom - top) / ph * h }
      const image = await renderInk(project, side, region)
      images.push(`<image x="${region.x/.254}" y="${region.y/.254}" width="${region.width/.254}" height="${region.height/.254}" xlink:href="${image}"/>`)
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" eda-version="2.4(2026-05-08)" width="${w}mm" height="${h}mm" viewBox="${view}" boardBox="${view}" mark-points="${marks.flat().map(v => v / .254).join(' ')}"><g${side === 'back' ? ` transform="translate(${(2*x+w)/.254} 0) scale(-1 1)"` : ''}>${images.join('')}</g></svg>`
    files[`Fabrication_Colorful${name}Silkscreen.${suffix}`] = await encryptColorSvg(svg)
  }
  files['Fabrication_ColorfulBoardOutlineLayer.FCBO'] = await encryptColorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${view}"><g transform="scale(${1/.254})"><path d="${project.board.outline}" fill="none" stroke="green" stroke-width="${2*.254}"/></g></svg>`)
  const coordinate = (point: number[], op: string) => `X${Math.round(point[0]!*1e5)}Y${Math.round(point[1]!*1e5)}D${op}*`
  files['Fabrication_ColorfulBoardOutlineMark.FCBM'] = strToU8(['G04 Overprint experimental color*','%FSLAX25Y25*%','%MOMM*%','%LPD*%','%ADD10C,0.15*%','%ADD11C,1*%','D10*',coordinate([x,-y-h],'02'),...[[x+w,-y-h],[x+w,-y],[x,-y],[x,-y-h]].map(p=>coordinate(p,'01')),'D11*',...marks.map(p=>coordinate(p,'03')),'M02*'].join('\n'))
  // Edited native ink is fully represented in the color file. Keeping its old
  // conventional silk would also request the original white printing.
  for (const [side, name] of [['front', 'F_Silkscreen'], ['back', 'B_Silkscreen']]) {
    if (!project.silk || hasNativeSilkEdits(project.board.layers[`${side}-silkscreen`] ?? [], project.artwork, side!)) {
      const reason = project.silk ? 'KiCad silkscreen replaced by Overprint color ink' : 'KiCad silkscreen hidden in Overprint'
      files[`${name}.gbr`] = strToU8(`G04 ${reason}*\n%FSLAX46Y46*%\n%MOMM*%\nM02*\n`)
    }
  }
  const date = new Date()
  for (const name of Object.keys(files)) {
    if (name.endsWith('.gbr')) files[name] = strToU8(withJlcColorHeader(strFromU8(files[name]!), date))
  }
  const zip = zipSync(files)
  if (zip.byteLength > 20_000_000) throw new Error('The generated ZIP exceeds the 20 MB upload limit.')
  return new Blob([new Uint8Array(zip)], { type: 'application/zip' })
}
