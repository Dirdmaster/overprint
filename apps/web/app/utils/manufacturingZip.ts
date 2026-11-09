import { zipSync, strToU8, strFromU8 } from 'fflate'
import ClipperLib from 'clipper-lib'
import { artworkRows } from './artwork'
import type { Composition } from './project'
import { validateFabrication } from './fabrication'
import { encryptColorSvg } from './colorEnvelope'
import { colorRegistration } from './colorRegistration'
import { jlcFabricationFilename, withJlcColorHeader } from './gerberCompatibility'
import { nativeSilkInks, hasNativeSilkEdits } from './nativeSilk'
import { addGerberRegions, goldItemRings, goldPath, polygonRings, validateGoldRegions } from './enigPaint'

const loadImage = async (source: string) => {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
}

// Rasterize only ink, never the gold/copper preview or fabrication overlay.
const renderInk = async (project: Composition, side: string, region: typeof project.board.bounds, exclusions: string[]) => {
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
  // Keep the embedded pixels readable from the selected side, including each tile.
  if (side === 'back') { ctx.translate(2 * x + width, 0); ctx.scale(-1, 1) }
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
    if (!visible || item.kind || item.gold) continue
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
  for (const path of exclusions) ctx.fill(new Path2D(path), 'evenodd')
  ctx.restore()
  return { source: canvas.toDataURL('image/png'), pixelWidth, pixelHeight }
}

const inkClipPath = (outline: string, exclusions: string[]) => {
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(polygonRings(outline), ClipperLib.PolyType.ptSubject, true)
  // Resolve each cutout's holes first, then subtract their union so overlapping
  // pad openings do not cancel each other.
  for (const path of exclusions) {
    const rings = ClipperLib.Clipper.SimplifyPolygons(polygonRings(path), ClipperLib.PolyFillType.pftEvenOdd)
    clipper.AddPaths(rings, ClipperLib.PolyType.ptClip, true)
  }
  const ink: ClipperLib.Paths = []
  clipper.Execute(ClipperLib.ClipType.ctDifference, ink, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftNonZero)
  const unitsPerSvgUnit = 100_000 * .254
  return ink.map(ring => `M${ring.map(({ X, Y }) => `${X / unitsPerSvgUnit},${Y / unitsPerSvgUnit}`).join(' L')} Z`).join(' ')
}

export const makeManufacturingZip = async (project: Composition) => {
  if (!project.board.fabrication) throw new Error('This board has no native Gerbers or drill files. Export it with the current KiCad plugin before manufacturing.')
  const fabrication = validateFabrication(project.board.fabrication)
  if (![2, 4].includes(fabrication.copperLayers)) throw new Error('The color test currently supports two- and four-layer boards.')
  const files: Record<string, Uint8Array> = Object.fromEntries(Object.entries(fabrication.files).map(([name, text]) => [name.slice(12), strToU8(text)]))
  for (const [side, prefix] of [['front', 'F'], ['back', 'B']] as const) {
    const regions = validateGoldRegions(project.board, project.artwork, side)
    if (regions.copper.length) {
      const name = `${prefix}_Cu.gbr`
      files[name] = strToU8(addGerberRegions(strFromU8(files[name]!), regions.copper))
    }
    if (regions.mask.length) {
      const name = `${prefix}_Mask.gbr`
      files[name] = strToU8(addGerberRegions(strFromU8(files[name]!), regions.mask))
    }
  }
  const { x, y, width: w, height: h } = project.board.bounds
  const registration = colorRegistration(project.board)
  const view = [x, y, w, h].map(v => v / .254).join(' ')
  const twiceCenterX = (2 * x + w) / .254
  for (const [side, name, suffix] of [['front', 'Top', 'FCTS'], ['back', 'Bottom', 'FCBS']] as const) {
    const gold = artworkRows(project.artwork, side, true).flatMap(({ item, visible }) =>
      visible && item.gold ? [goldPath(goldItemRings(item))] : [])
    const exclusions = [project.board.holes, ...(project.board.layers[`${side}-mask`] ?? []), ...gold].filter(path => path.trim())
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
      const { source, pixelWidth, pixelHeight } = await renderInk(project, side, region, exclusions)
      const [leftX, topY, width, height] = [region.x / .254, region.y / .254, region.width / .254, region.height / .254] as const
      if (side === 'back') {
        // Place rear-view pixels in native coordinates. The enclosing group
        // then reflects the entire rear layer back into its print orientation.
        const matrix = [-width / pixelWidth, 0, 0, height / pixelHeight, twiceCenterX - leftX, topY].join(' ')
        images.push(`<image width="${pixelWidth}" height="${pixelHeight}" preserveAspectRatio="none" xlink:href="${source}" transform="matrix(${matrix})"/>`)
      } else {
        images.push(`<image x="${leftX}" y="${topY}" width="${width}" height="${height}" xlink:href="${source}"/>`)
      }
    }
    const clip = inkClipPath(project.board.outline, exclusions)
    const transform = side === 'back' ? ` transform="scale(-1 1) translate(${-twiceCenterX} 0)"` : ''
    const ink = `<defs><clipPath id="print-area"><path d="${clip}" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#print-area)"${transform}>${images.join('')}</g>`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" eda-version="2.4(2026-05-08)" width="${w}mm" height="${h}mm" viewBox="${view}" boardBox="${view}" mark-points="${registration.svgMarks}">${ink}</svg>`
    files[`Fabrication_Colorful${name}Silkscreen.${suffix}`] = await encryptColorSvg(svg)
  }
  files['Fabrication_ColorfulBoardOutlineLayer.FCBO'] = await encryptColorSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${view}"><g transform="scale(${1/.254})"><path d="${project.board.outline}" fill="none" stroke="green" stroke-width="${2*.254}"/></g></svg>`)
  files['Fabrication_ColorfulBoardOutlineMark.FCBM'] = strToU8(registration.gerber)
  // The color PNG already contains the visible native ink. Conventional
  // silkscreen can print over the composition as a separate black layer.
  for (const [side, name] of [['front', 'F_Silkscreen'], ['back', 'B_Silkscreen']]) {
    const gold = artworkRows(project.artwork, side!, true).some(({ item, visible }) => visible && item.gold)
    const nativePaths = project.board.layers[`${side}-silkscreen`] ?? []
    if (!project.silk || gold || nativePaths.some(path => path.trim()) || hasNativeSilkEdits(nativePaths, project.artwork, side!)) {
      const reason = project.silk
        ? `KiCad silkscreen replaced by Overprint color ink${gold ? ' and ENIG openings' : ''}`
        : 'KiCad silkscreen hidden in Overprint'
      files[`${name}.gbr`] = strToU8(`G04 ${reason}*\n%FSLAX46Y46*%\n%MOMM*%\nM02*\n`)
    }
  }
  const date = new Date()
  const named = Object.entries(files).map(([name, bytes]) => {
    const gerber = name.endsWith('.gbr')
    const text = gerber || name.endsWith('.drl') ? strFromU8(bytes) : ''
    return { name, jlcName: jlcFabricationFilename(name, text), bytes: gerber ? strToU8(withJlcColorHeader(text, date)) : bytes }
  })
  const counts = new Map<string, number>()
  for (const { jlcName } of named) {
    counts.set(jlcName, (counts.get(jlcName) ?? 0) + 1)
  }
  // Older saved projects can contain several drill files of the same type.
  // Use their original names if the standard name would drop a file.
  const zip = zipSync(Object.fromEntries(named.map(({ name, jlcName, bytes }) => [
    counts.get(jlcName) === 1 ? jlcName : name, bytes,
  ])))
  if (zip.byteLength > 20_000_000) throw new Error('The generated ZIP exceeds the 20 MB upload limit.')
  return new Blob([new Uint8Array(zip)], { type: 'application/zip' })
}
