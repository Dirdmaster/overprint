import { importBoardFile } from './importBoardFile'

export const readBoardFile = (file: File, signal?: AbortSignal) =>
  importBoardFile(file, signal, () => new Worker(new URL('../workers/kicadImport.ts', import.meta.url), { type: 'module' }))
