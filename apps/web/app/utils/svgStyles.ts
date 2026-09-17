// Flatten the simple class rules used by vector exporters into SVG attributes.
// More complex CSS needs a complete cascade implementation; reject it explicitly.
export const flattenSvgStyles = (doc: Document) => {
  const properties = new Set(['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset'])
  const unsupported = () => new Error('Unsupported SVG CSS. Export simple class-based fills and strokes or presentation attributes.')
  for (const style of [...doc.getElementsByTagNameNS('http://www.w3.org/2000/svg', 'style')]) {
    if (style.attributes.length) throw unsupported()
    let css = (style.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '').trim()
    while (css) {
      const rule = /^([^{}]+)\{([^{}]*)\}/.exec(css)
      if (!rule) throw unsupported()
      const selectors = rule[1]!.split(',').map(value => value.trim())
      if (!selectors.every(value => /^\.[a-zA-Z_][\w-]*$/.test(value))) throw unsupported()
      const declarations = rule[2]!.split(';').map(value => value.trim()).filter(Boolean).map(value => {
        const declaration = /^([a-z-]+)\s*:\s*([^{};!]+)$/.exec(value)
        if (!declaration || !properties.has(declaration[1]!)) throw unsupported()
        return [declaration[1]!, declaration[2]!.trim()] as const
      })
      for (const node of doc.querySelectorAll(selectors.join(','))) {
        for (const [property, value] of declarations) node.setAttribute(property, value)
      }
      css = css.slice(rule[0].length).trim()
    }
    style.remove()
  }
}
