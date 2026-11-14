import { useArtwork } from './useArtwork'
import { useComposition } from '../project/useComposition'
import { validatePalette, replaceArtworkColor, renderAppearance, type AppearanceDefinition, type PaletteColor } from '../../utils/artworkAppearance'
export const useArtworkPalette = () => {
  const a = useArtwork(), { palette } = useComposition()
  const setPalette = (next: PaletteColor[]) => { const valid = validatePalette(next); a.checkpoint(); palette.value = valid }
  const replaceColor = async (from: string, to: string) => {
    if (![from, to].every(c => /^#[a-f\d]{6}$/i.test(c))) throw new Error('Choose valid hex colors.')
    const original = a.items.value
    const next = await Promise.all(original.map(item => replaceArtworkColor(item, from, to)))
    if (a.items.value !== original) throw new Error('Artwork changed. Preview the color replacement again.')
    if (next.some((item, i) => item !== original[i] && !item.nativeSilk && !a.canPatch(item.id, { source: item.source }))) throw new Error('Unlock affected artwork before replacing colors.')
    a.checkpoint(); a.items.value = next; palette.value = palette.value.map(c => c.color.toLowerCase() === from.toLowerCase() ? { ...c, color: to } : c)
  }
  const appearance = async (value: Omit<AppearanceDefinition, 'version' | 'base'>) => {
    const selected = a.selectedArtwork.value, original = a.items.value
    if (!selected.length || selected.some(i => i.library || i.gold || !a.canPatch(i.id, { source: i.source }))) throw new Error('Select unlocked, detached graphics to fill.')
    const changes = await Promise.all(selected.map(async i => ({ id: i.id, patch: { ...await renderAppearance({ version: 1, ...value, base: i.appearance?.base ?? i.source }), text: undefined, drawing: undefined, vector: undefined } })))
    if (a.items.value !== original) throw new Error('Artwork changed before applying the appearance.')
    a.checkpoint(); a.patchItems(changes)
  }
  return { palette, setPalette, replaceColor, appearance }
}
