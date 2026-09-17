import { zipSync, strToU8 } from 'fflate'

// Original synthetic geometry for portable tests. No user PCB or artwork.
const rectangle = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const path = (ring: number[][]) => `M${ring.map(point => point.join(',')).join(' L')} Z`
const manifest = {
  format: 'overprint-board', version: 1,
  board: { name: 'Demo board', boundsMm: { x: 10, y: 20, width: 56, height: 100 } },
  coordinates: { units: 'mm', backDisplay: 'mirror-x-about-board-center' },
}
const geometry = {
  outlines: [{ outer: rectangle(10, 20, 56, 100), holes: [] }],
  holes: [{ polygons: [{ outer: rectangle(13, 23, 2, 2), holes: [] }] }],
  pads: [], footprints: [],
}
const files: Record<string, Uint8Array> = {
  'manifest.json': strToU8(JSON.stringify(manifest)),
  'geometry.json': strToU8(JSON.stringify(geometry)),
}
for (const side of ['front', 'back']) {
  for (const layer of ['silkscreen', 'mask', 'copper', 'fabrication']) {
    const ring = layer === 'silkscreen' ? rectangle(side === 'front' ? 17 : 51, 30, 8, 5)
      : layer === 'mask' || layer === 'copper' ? rectangle(13, 23, 4, 4) : []
    files[`layers/${side}-${layer}.svg`] = strToU8(`<svg xmlns="http://www.w3.org/2000/svg">${ring.length ? `<path d="${path(ring)}"/>` : ''}</svg>`)
  }
}
export const demoBoard = { name: 'demo.overprint-board', mimeType: 'application/zip', buffer: Buffer.from(zipSync(files)) }
