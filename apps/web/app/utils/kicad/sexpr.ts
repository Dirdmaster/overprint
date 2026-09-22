/** Bounded, non-evaluating reader for KiCad's S-expression board format. */
export type SExpr = (string | SExpr)[]
export const children = (node: SExpr, name?: string): SExpr[] => node.filter((v): v is SExpr => Array.isArray(v) && (!name || v[0] === name))
// Most fields precede a footprint's graphics. Stop at the match rather than
// scanning tens of thousands of artwork polygons for every coordinate lookup.
export const child = (node: SExpr, name: string): SExpr => node.find((value): value is SExpr => Array.isArray(value) && value[0] === name) ?? []
export const atom = (node: SExpr, index = 1): string => typeof node[index] === 'string' ? node[index] as string : ''
export const number = (node: SExpr, index = 1, fallback?: number): number => {
  const value = atom(node, index)
  if (!value && fallback !== undefined) return fallback
  const n = Number(value)
  if (!value || !Number.isFinite(n) || Math.abs(n) >= 100000) throw new Error('Invalid numeric value in KiCad PCB.')
  return n
}
export const flag = (node: SExpr, name: string): boolean => node.includes(name) || atom(child(node, name)) === 'yes'
export const parseSExpr = (text: string): SExpr => {
  const root: SExpr = [], stack = [root]
  let tokens = 0
  for (let i = 0; i < text.length;) {
    const c = text[i]!
    if (/\s/.test(c)) { i++; continue }
    if (++tokens > 2_000_000) throw new Error('KiCad PCB exceeds the parsing complexity limit.')
    if (c === '(') {
      if (stack.length >= 100) throw new Error('KiCad PCB nesting exceeds the limit.')
      const list: SExpr = []
      stack.at(-1)!.push(list); stack.push(list); i++
    } else if (c === ')') {
      if (stack.length === 1) throw new Error('Invalid KiCad PCB: unexpected closing parenthesis.')
      stack.pop(); i++
    } else if (c === '"') {
      let value = '', closed = false
      for (i++; i < text.length; i++) {
        if (text[i] === '"') { i++; closed = true; break }
        if (text[i] === '\\') {
          const next = text[++i]
          if (next === undefined) break
          value += ({ n: '\n', r: '\r', t: '\t' } as Record<string, string>)[next] ?? next
        } else value += text[i]
      }
      if (!closed) throw new Error('Invalid KiCad PCB: unterminated string.')
      stack.at(-1)!.push(value)
    } else {
      const start = i
      while (i < text.length && !/[\s()"]/.test(text[i]!)) i++
      stack.at(-1)!.push(text.slice(start, i))
    }
  }
  if (stack.length !== 1 || root.length !== 1 || !Array.isArray(root[0]) || root[0][0] !== 'kicad_pcb') throw new Error('Invalid KiCad PCB. Choose a .kicad_pcb file.')
  return root[0]
}
