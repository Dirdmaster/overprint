import type { BoardPackage } from '../boardPackage'
import { atom, child, parseSExpr } from './sexpr.ts'
import { createBoardGeometry } from './boardGeometry.ts'
import { collectBoardItems } from './boardItems.ts'

/** Extract a saved PCB without dependencies on KiCad, network access, or DOM APIs. */
export const extractKicadBoard = (text: string, filename: string): BoardPackage => {
  if (new TextEncoder().encode(text).length > 25_000_000) throw new Error('This KiCad PCB exceeds the 25 MB limit.')
  const board = parseSExpr(text)
  // KiCad 6 introduced three-point arcs; legacy and future formats need explicit support.
  const version = Number(atom(child(board, 'version')))
  if (!Number.isInteger(version) || version < 20211014 || version > 20260206) throw new Error('Browser import supports KiCad 6–10 PCB files. Save this PCB in a supported version or use the plugin.')
  const geometry = createBoardGeometry()
  collectBoardItems(board, geometry)
  return geometry.finish(filename)
}

/** Model conversion is optional: publish geometry first so its timeout can fall back safely. */
export const extractKicadBoardWithModels = async (text: string, filename: string, onGeometry: (board: BoardPackage) => void, reader?: import('./stepModels.ts').StepReader): Promise<BoardPackage> => {
  const result = extractKicadBoard(text, filename)
  onGeometry(result)
  const { importEmbeddedModels } = await import('./embeddedModels.ts')
  try {
    result.models = await importEmbeddedModels(parseSExpr(text), reader)
  } catch (error) {
    result.browserImport!.warnings.push(error instanceof Error ? error.message : 'Unable to read embedded models.')
  }
  if (new TextEncoder().encode(JSON.stringify(result)).length > 15_000_000) {
    delete result.models
    result.browserImport!.warnings.push('Component models were omitted because the imported project exceeds the 15 MB limit.')
  }
  return result
}
