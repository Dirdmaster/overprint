import type { CanvasTool } from './drawing'
export type ToolGroup = 'selection' | 'shapes' | 'paths' | 'type' | 'paint' | 'navigation'
export type CanvasToolDefinition = { id: CanvasTool; group: ToolGroup; label: string; shortcut: string; hint: string }
export const canvasToolDefinitions: CanvasToolDefinition[] = [
  { id: 'select', group: 'selection', label: 'Select (V)', shortcut: 'V', hint: 'Drag to select. Shift adds to selection or constrains movement.' },
  { id: 'directSelect', group: 'selection', label: 'Direct selection (A)', shortcut: 'A', hint: 'Select a path to edit its nodes. Shift constrains a node drag.' },
  { id: 'rectangle', group: 'shapes', label: 'Draw rectangle', shortcut: 'M', hint: 'Drag to draw. Shift makes a square; Option/Alt draws from the center.' },
  { id: 'roundedRectangle', group: 'shapes', label: 'Draw rounded rectangle', shortcut: '', hint: 'Drag to draw. Adjust the radius in Properties.' },
  { id: 'ellipse', group: 'shapes', label: 'Draw ellipse', shortcut: 'L', hint: 'Drag to draw. Shift makes a circle; Option/Alt draws from the center.' },
  { id: 'line', group: 'shapes', label: 'Draw line', shortcut: '\\', hint: 'Drag to draw. Shift constrains to 45° increments.' },
  { id: 'pen', group: 'paths', label: 'Pen (P)', shortcut: 'P', hint: 'Click nodes. Click the first node to close. Enter finishes an open path.' },
  { id: 'text', group: 'type', label: 'Draw text', shortcut: 'T', hint: 'Click to create editable text. Use the inspector to choose a Google Font.' },
  { id: 'paint', group: 'paint', label: 'Live paint (K)', shortcut: 'K', hint: 'Click to fill a region. Drag to paint several regions in one undo step.' },
  { id: 'hand', group: 'navigation', label: 'Hand (hold Space)', shortcut: 'H', hint: 'Drag to pan. Hold Space from another tool for a temporary Hand.' },
]
export const canvasToolGroups: { id: ToolGroup; label: string }[] = [
  { id: 'selection', label: 'Selection tools' }, { id: 'shapes', label: 'Shape tools' },
  { id: 'paths', label: 'Path tools' }, { id: 'type', label: 'Type tools' },
  { id: 'paint', label: 'Paint tools' }, { id: 'navigation', label: 'Navigation tools' },
]
export const shortcutTool = (key: string) => canvasToolDefinitions.find(tool => tool.shortcut.toLowerCase() === key.toLowerCase())?.id
