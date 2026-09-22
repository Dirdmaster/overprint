import { readBoardPackage, type BoardPackage } from './boardPackage'

/** Native files stay local; isolate bounded extraction from the editor's UI thread. */
export const importBoardFile = async (file: File, signal: AbortSignal | undefined, createWorker: () => Worker): Promise<BoardPackage> => {
  if (!/\.kicad_pcb$/i.test(file.name)) return readBoardPackage(file)
  if (file.size > 25_000_000) throw new Error('This KiCad PCB exceeds the 25 MB limit.')
  signal?.throwIfAborted()
  const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = createWorker()
    const finish = (board?: BoardPackage, error?: Error) => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      if (error) reject(error)
      else resolve(board!)
    }
    const abort = () => finish(undefined, new Error('Board import cancelled.'))
    const timeout = setTimeout(() => finish(undefined, new Error('KiCad PCB extraction timed out. Try the KiCad plugin for this board.')), 30_000)
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ board?: BoardPackage; error?: string }>) => {
      finish(event.data.board, event.data.error ? new Error(event.data.error) : undefined)
    }
    worker.onerror = () => finish(undefined, new Error('Unable to start the KiCad PCB importer. Reload and try again.'))
    worker.postMessage({ text, name: file.name })
  })
}
