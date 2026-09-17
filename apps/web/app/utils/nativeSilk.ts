import type { Artwork } from './artwork'

export const nativeSilkId = (side: string) => `kicad:${side}`
export const isNativeSilk = (id: string | null) => id === 'kicad:front' || id === 'kicad:back'
export const nativeSilkSettings = (items: Artwork[], side: string) => items.find(item => item.side === side && item.nativeSilk)?.nativeSilk

// Exact path matching preserves colors across an unchanged re-export without
// applying old paint to a moved or replaced KiCad shape.
export const nativeSilkInks = (paths: string[], items: Artwork[], side: string, defaultColor: string) => {
  const settings = nativeSilkSettings(items, side)
  return paths.map(path => ({ path, color: settings?.colors[path] ?? settings?.baseColor ?? defaultColor }))
}

export const hasNativeSilkEdits = (paths: string[], items: Artwork[], side: string) => {
  const settings = nativeSilkSettings(items, side)
  return !!settings && (!!settings.baseColor || paths.some(path => settings.colors[path]))
}
