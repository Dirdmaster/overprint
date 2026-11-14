import program from './panel_cam.py?raw'
import type { PanelCamJob, PanelCamMessage } from './panelCam'

const send = (message: PanelCamMessage) => self.postMessage(message)
self.onmessage = async ({ data }: MessageEvent<PanelCamJob>) => {
  try {
    const base = new URL('/panel-cam/', self.location.href)
    const runtime = new URL('pyodide.mjs', base).href
    const { loadPyodide } = await import(/* @vite-ignore */ runtime) as typeof import('pyodide')
    const python = await loadPyodide({ indexURL: base.href })
    await python.loadPackage([
      'numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl',
      'shapely-2.0.7-cp313-cp313-pyodide_2025_0_wasm32.whl',
      'gerbonara-1.6.3-py3-none-any.whl',
    ].map(name => new URL(name, base).href))
    python.runPython(program)
    python.globals.set('panel_job', JSON.stringify(data))
    const result = python.runPython('import json\njson.dumps(build_panel(json.loads(panel_job)))')
    send({ result: JSON.parse(result) })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send({ error: [...message.matchAll(/^ValueError: ([^\r\n]+)/gm)].at(-1)?.[1] ?? 'The local panel fabrication engine failed to load or read these files.' })
  }
}
