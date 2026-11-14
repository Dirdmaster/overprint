import { useArtwork } from './useArtwork'
import { renderText, type ArtworkText } from '../../utils/artworkText'

export const useArtworkText = () => {
  const { items, checkpoint, canPatch } = useArtwork()
  const updateText = (id: string, patch: Partial<ArtworkText>) => {
    const item = items.value.find(item => item.id === id)
    if (!item?.text) throw new Error('Select an editable text layer.')
    if (!canPatch(id, { source: item.source })) throw new Error('Unlock and detach the text before editing.')
    const previous = renderText(item.text)
    const next = renderText({ ...item.text, ...patch })
    const width = next.width * item.width / previous.width
    const height = next.height * item.height / previous.height
    if (!Number.isFinite(width) || !Number.isFinite(height) || Math.max(width, height) > 10000) throw new Error('Text exceeds the artwork size limit.')
    if (JSON.stringify(next.text) === JSON.stringify(item.text)) return
    checkpoint()
    items.value = items.value.map(value => value.id === id ? { ...value, text: next.text, source: next.source, x: value.x + (value.width - width) / 2, y: value.y + (value.height - height) / 2, width, height } : value)
  }
  const outlineText = (id: string) => {
    if (!items.value.some(item => item.id === id && item.text)) return
    if (!canPatch(id, { text: undefined })) throw new Error('Unlock and detach the text before converting.')
    checkpoint(); items.value = items.value.map(item => item.id === id ? { ...item, text: undefined } : item)
  }
  return { updateText, outlineText }
}
