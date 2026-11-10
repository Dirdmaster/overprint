import { extractKicadBoardWithModels } from '../utils/kicad/extract'
self.onmessage = async (event: MessageEvent<{ text: string; name: string }>) => {
  try {
    const board = await extractKicadBoardWithModels(event.data.text, event.data.name, geometry => self.postMessage({ geometry }))
    self.postMessage({ board })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Unable to read this KiCad PCB.' })
  }
}
