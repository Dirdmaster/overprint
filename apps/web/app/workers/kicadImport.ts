import { extractKicadBoard } from '../utils/kicad/extract'
self.onmessage = (event: MessageEvent<{ text: string; name: string }>) => {
  try {
    self.postMessage({ board: extractKicadBoard(event.data.text, event.data.name) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Unable to read this KiCad PCB.' })
  }
}
