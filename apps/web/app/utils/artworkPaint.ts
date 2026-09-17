import type { Artwork } from './artwork'
import { createSvgCutouts } from './svgCutouts'

const shapes = 'path, rect, circle, ellipse, polygon, polyline'
const ns = 'http://www.w3.org/2000/svg'
export type ArtworkPaintHit = { key: string; artworkId: string; index: number; cutout?: string }

// Mount only validated artwork sources (readArtwork also validates saved projects).
// The browser supplies curve geometry and nested/viewBox transforms. IDs are
// namespaced so private SVG definitions cannot collide with the editor or peers.
export const createArtworkPaint = (host: SVGGElement, artwork: Artwork[], side: string, prefix: string) => {
  const entries = artwork.map(item => {
    const doc = new DOMParser().parseFromString(item.source, 'image/svg+xml')
    const original = [...doc.querySelectorAll<SVGGeometryElement>(shapes)].filter(node => !node.closest('defs, clipPath, mask'))
    const root = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
    if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${Number(root.getAttribute('width')?.replace(/px$/, ''))} ${Number(root.getAttribute('height')?.replace(/px$/, ''))}`)
    const nodes = [...root.querySelectorAll<SVGGeometryElement>(shapes)].filter(node => !node.closest('defs, clipPath, mask'))
    const ids = new Map([...root.querySelectorAll('[id]'), root].filter(node => node.id).map(node => [node.id, `${prefix}-${item.id}-${node.id}`]))
    for (const node of [root, ...root.querySelectorAll('*')]) {
      if (node.id) node.id = ids.get(node.id)!
      for (const attr of [...node.attributes]) if (attr.value.startsWith('url(#')) node.setAttribute(attr.name, attr.value.replace(/url\(#([^)]*)\)/g, (_, id) => `url(#${ids.get(id) ?? id})`))
    }
    root.setAttribute('x', String(item.x)); root.setAttribute('y', String(item.y))
    root.setAttribute('width', String(item.width)); root.setAttribute('height', String(item.height))
    const group = document.createElementNS(ns, 'g')
    group.setAttribute('transform', `rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})${side === 'back' ? ` translate(${2 * item.x + item.width} 0) scale(-1 1)` : ''}`)
    group.append(root); host.append(group)
    const unsupported = [...root.querySelectorAll('*'), root].some(node => ['mask', 'clip-path'].some(attr => node.hasAttribute(attr) && node.getAttribute(attr) !== 'none'))
    const cutouts = new Map<SVGGeometryElement, ReturnType<typeof createSvgCutouts>>()
    let shapeIndex = 0
    // Inserting faces must not renumber regions already visited during a drag.
    const keys = nodes.map(node => {
      const face = node.getAttribute('data-overprint-cutout')
      return face === null ? `shape:${shapeIndex++}` : face === 'true' ? `face:${node.getAttribute('d')}:${node.getAttribute('transform')}` : face
    })
    return { item, doc, original, nodes, root, group, unsupported, cutouts, keys }
  })
  const hit = (x: number, y: number): ArtworkPaintHit | undefined => {
    if (entries.some(entry => entry.unsupported)) return
    // Mirror the artwork renderer's painter order: the last visible shape wins.
    for (const entry of [...entries].reverse()) {
      const viewport = entry.root.getBoundingClientRect()
      if (x < viewport.left || x > viewport.right || y < viewport.top || y > viewport.bottom) continue
      const rootMatrix = entry.root.getScreenCTM(), box = entry.root.viewBox.baseVal
      if (!rootMatrix) continue
      const local = new DOMPoint(x, y).matrixTransform(rootMatrix.inverse())
      if (local.x < box.x || local.x > box.x + box.width || local.y < box.y || local.y > box.y + box.height) continue
      for (let index = entry.nodes.length - 1; index >= 0; index--) {
        const node = entry.nodes[index]!, style = getComputedStyle(node)
        if (style.fill === 'none' || Number(style.fillOpacity) === 0 || style.visibility !== 'visible') continue
        let hidden = false
        for (let ancestor: Element | null = node; ancestor && ancestor !== host; ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor)
          if (css.display === 'none' || Number(css.opacity) === 0) { hidden = true; break }
        }
        if (hidden) continue
        const matrix = node.getScreenCTM()
        if (!matrix) continue
        const point = new DOMPoint(x, y).matrixTransform(matrix.inverse())
        if (node.isPointInFill(point)) return { key: `${entry.item.id}:${entry.keys[index]}`, artworkId: entry.item.id, index }
        if (!entry.cutouts.has(node)) entry.cutouts.set(node, createSvgCutouts(node))
        const cutout = entry.cutouts.get(node)!(point)
        if (cutout) return { key: `${entry.item.id}:${entry.keys[index]}:hole:${cutout}`, artworkId: entry.item.id, index, cutout }
      }
    }
  }
  const recolor = (target: ArtworkPaintHit, color: string) => {
    const entry = entries.find(entry => entry.item.id === target.artworkId)
    const node = entry?.original[target.index]
    if (!entry || !node) return
    if (target.cutout) {
      // Place the new face beneath its original boundary, in the same SVG and
      // transform space. Existing outlines and overlying artwork stay intact.
      const existing = [...node.parentElement!.children].find(candidate => candidate.hasAttribute('data-overprint-cutout') && candidate.getAttribute('d') === target.cutout && candidate.getAttribute('transform') === node.getAttribute('transform'))
      if (existing?.getAttribute('fill') === color) return
      const fill = existing ?? entry.doc.createElementNS(ns, 'path')
      const previous = fill.getAttribute('fill')
      if (!existing) {
        fill.setAttribute('data-overprint-cutout', target.key.slice(entry.item.id.length + 1))
        fill.setAttribute('d', target.cutout)
        fill.setAttribute('fill-rule', 'evenodd')
        fill.setAttribute('stroke', 'none')
        if (node.hasAttribute('transform')) fill.setAttribute('transform', node.getAttribute('transform')!)
        node.before(fill)
      }
      fill.setAttribute('fill', color)
      const source = new XMLSerializer().serializeToString(entry.doc.documentElement)
      if (new TextEncoder().encode(source).length > 2_000_000) {
        if (!existing) fill.remove()
        else if (previous === null) fill.removeAttribute('fill')
        else fill.setAttribute('fill', previous)
      }
      return source
    }
    if (node.getAttribute('fill')?.toLowerCase() === color.toLowerCase()) return
    const previous = node.getAttribute('fill')
    node.setAttribute('fill', color)
    const source = new XMLSerializer().serializeToString(entry.doc.documentElement)
    if (new TextEncoder().encode(source).length > 2_000_000) {
      if (previous === null) node.removeAttribute('fill')
      else node.setAttribute('fill', previous)
    }
    return source
  }
  const highlight = (target: ArtworkPaintHit, overlay: SVGGElement, color: string) => {
    overlay.replaceChildren()
    const node = entries.find(entry => entry.item.id === target.artworkId)?.nodes[target.index]
    const matrix = node?.getScreenCTM(), parent = overlay.getScreenCTM()
    if (!node || !matrix || !parent) return
    const transform = parent.inverse().multiply(matrix)
    for (const [stroke, width] of [['#161b18', '4'], ['#ff637e', '2']]) {
      const clone = node.cloneNode(false) as SVGGeometryElement
      clone.removeAttribute('id'); clone.removeAttribute('class')
      // getScreenCTM may return legacy SVGMatrix, whose toString() is not SVG.
      clone.setAttribute('transform', `matrix(${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.e} ${transform.f})`)
      if (target.cutout) clone.setAttribute('d', target.cutout)
      clone.setAttribute('fill', width === '4' ? color : 'none'); clone.setAttribute('fill-opacity', '0.2')
      clone.setAttribute('fill-rule', target.cutout ? 'evenodd' : getComputedStyle(node).fillRule)
      clone.setAttribute('stroke', stroke!); clone.setAttribute('stroke-width', width!)
      clone.setAttribute('stroke-opacity', '1'); clone.setAttribute('vector-effect', 'non-scaling-stroke')
      overlay.append(clone)
    }
  }
  return { hit, recolor, highlight, unsupported: entries.some(entry => entry.unsupported), dispose: () => entries.forEach(entry => entry.group.remove()) }
}
