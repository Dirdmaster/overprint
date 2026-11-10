import type { BoardPackage } from '../boardPackage'
import { makeManufacturingZip, placedPath, prepareFabrication, type InkPlacement } from '../manufacturingZip'
import type { Composition } from '../project'
import { buildPanelCam, type PanelRings } from './panelCam'
import { assertPanelSize, panelBounds, PANEL_RAIL, validPanelTabs, type PanelPlacement, type PanelTabs } from './panelLayout'

const ringPath = (rings: PanelRings) => rings.map(ring => `M${ring.map(point => point.join(',')).join(' L')} Z`).join(' ')

export const buildPanel = async (name: string, projects: Composition[], placements: PanelPlacement[], options: { gap: number; signal?: AbortSignal; tabs?: PanelTabs }) => {
  const { gap, signal, tabs } = options
  if (tabs && !validPanelTabs(tabs)) throw new Error('Choose between one and four tabs per selected edge.')
  assertPanelSize(panelBounds(projects.map(project => ({ bounds: project.board.bounds, quantity: 1 })), placements, gap))
  const fabrications = projects.map(project => {
    try { return prepareFabrication(project) } catch (error) {
      throw new Error(`${project.board.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  const copperLayers = fabrications[0]!.copperLayers
  if (fabrications.some(fab => fab.copperLayers !== copperLayers)) throw new Error('All designs must have the same number of copper layers.')
  const cam = await buildPanelCam({
    copperLayers, gap, placements, rail: PANEL_RAIL, tabs,
    sources: projects.map((project, i) => ({
      name: project.board.name,
      bounds: project.board.bounds,
      files: fabrications[i]!.files,
    })),
  }, signal)
  const [x, y, right, bottom] = cam.bounds
  const biteRadius = cam.biteDiameter / 2
  const biteHoles = ringPath(cam.bites.map(([cx, cy]) => Array.from({ length: 32 }, (_, i) => {
    const theta = i * 2 * Math.PI / 32
    return [cx + biteRadius * Math.cos(theta), cy + biteRadius * Math.sin(theta)]
  })))
  const ink: InkPlacement[] = placements.map((placement, i) => ({
    ...placement,
    project: projects[placement.source]!,
    outline: ringPath(cam.boardOutlines[i]!),
    localOutline: ringPath(cam.localOutlines[placement.source]!),
  }))
  const board: BoardPackage = {
    name,
    bounds: { x, y, width: right - x, height: bottom - y },
    outline: ringPath(cam.outline),
    holes: [biteHoles, ...ink.map(placement => placedPath(placement.project.board.holes, placement))].join(' '),
    layers: {},
    fabrication: { version: 1, originMm: [0, 0], copperLayers, files: cam.files },
  }
  const project: Composition = {
    version: 1, board, artwork: [], mask: '#101820', side: 'front', silk: false, fabrication: true,
  }
  const color = { placements: ink, biteHoles }
  return { board, download: () => makeManufacturingZip(project, color) }
}
