export type Fabrication = {
  version: 1
  copperLayers: number
  originMm: [number, number]
  files: Record<string, string>
}

/** Validate both imported packages and saved projects without changing native text. */
export function validateFabrication(value: unknown): Fabrication {
  const fail = (): never => { throw new Error('Invalid fabrication files. Re-export the board with the current KiCad plugin.') }
  if (!value || typeof value !== 'object') return fail()
  const f = value as Fabrication
  if (f.version !== 1 || !Number.isInteger(f.copperLayers) || f.copperLayers < 2 || f.copperLayers > 32 || f.copperLayers % 2 || !Array.isArray(f.originMm) || f.originMm.length !== 2 || !f.originMm.every(n => n === 0) || !f.files || typeof f.files !== 'object' || Array.isArray(f.files)) return fail()
  const entries = Object.entries(f.files)
  let size = 0
  if (entries.length > 80) return fail()
  for (const [name, text] of entries) {
    if (!/^fabrication\/(?:[A-Za-z0-9_-]+)\.(?:gbr|drl)$/.test(name) || typeof text !== 'string' || text.includes('\0')) return fail()
    size += new TextEncoder().encode(text).length
    if (size > 15_000_000) throw new Error('Fabrication files exceed the 15 MB limit.')
    if (name.endsWith('.gbr') ? !text.includes('%MOMM*%') || !text.includes('M02*') : !text.includes('M48') || !text.includes('M30')) return fail()
  }
  const required = ['F_Cu', 'B_Cu', 'F_Mask', 'B_Mask', 'F_Silkscreen', 'B_Silkscreen', 'Edge_Cuts']
  for (let i = 1; i <= f.copperLayers - 2; i++) required.push(`In${i}_Cu`)
  if (!required.every(name => Object.hasOwn(f.files, `fabrication/${name}.gbr`)) || !entries.some(([name]) => name.endsWith('.drl'))) return fail()
  return f
}
