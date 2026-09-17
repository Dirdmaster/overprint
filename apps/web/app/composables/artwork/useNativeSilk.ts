import { nativeSilkId, nativeSilkSettings } from '~/utils/nativeSilk'
import type { Artwork } from '~/utils/artwork'

export const useNativeSilk = () => {
  const { items, checkpoint } = useArtwork()
  const update = (side: string, nativeSilk: NonNullable<Artwork['nativeSilk']>, record = true) => {
    if (record) checkpoint()
    const existing = items.value.find(item => item.side === side && item.nativeSilk)
    if (existing) items.value = items.value.map(item => item === existing ? { ...item, nativeSilk } : item)
    else items.value = [...items.value, { id: nativeSilkId(side), name: 'KiCad silkscreen', kind: 'layer', nativeSilk, side, source: '', visible: true, x: 0, y: 0, width: 1, height: 1, rotation: 0 }]
  }
  const setColor = (side: string, path: string, color: string, record = true) => {
    const settings = nativeSilkSettings(items.value, side)
    update(side, { ...settings, colors: { ...settings?.colors, [path]: color } }, record)
  }
  const setBaseColor = (side: string, baseColor: string) => {
    const settings = nativeSilkSettings(items.value, side)
    if (settings?.baseColor === baseColor) return
    update(side, { ...settings, baseColor, colors: settings?.colors ?? {} })
  }
  const resetColors = (side: string) => {
    if (!nativeSilkSettings(items.value, side)) return
    checkpoint(); items.value = items.value.filter(item => !(item.side === side && item.nativeSilk))
  }
  return { setColor, setBaseColor, resetColors }
}
