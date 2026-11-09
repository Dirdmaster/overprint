import type { BoardPackage } from '../boardPackage'
import type { PanelPlacement } from './panelLayout'

export type PanelCamJob = {
  sources: { name: string; bounds: BoardPackage['bounds']; files: Record<string, string> }[]
  placements: PanelPlacement[]
  gap: number
  copperLayers: number
}
type Point = [number, number]
export type PanelRings = Point[][]
export type PanelCamResult = {
  outline: PanelRings
  localOutlines: PanelRings[]
  boardOutlines: PanelRings[]
  bites: Point[]
  bounds: [number, number, number, number]
  files: Record<string, string>
}
export type PanelCamMessage = { result: PanelCamResult } | { error: string }

export const buildPanelCam = (job: PanelCamJob, signal?: AbortSignal): Promise<PanelCamResult> => {
  const current = new Worker(new URL('./panelCam.worker.ts', import.meta.url), { type: 'module' })
  return new Promise((resolve, reject) => {
    const close = () => {
      signal?.removeEventListener('abort', abort)
      current.terminate()
    }
    const abort = () => { close(); reject(new DOMException('Panel build cancelled.', 'AbortError')) }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    current.onmessage = ({ data }: MessageEvent<PanelCamMessage>) => {
      close()
      if ('error' in data) reject(new Error(data.error))
      else resolve(data.result)
    }
    current.onerror = current.onmessageerror = () => {
      close()
      reject(new Error('The local panel fabrication engine could not run. Reload Overprint and try again.'))
    }
    current.postMessage(job)
  })
}
