import { computed } from 'vue'
import { useEditorRef } from '../editor/editorState'
import { useComposition } from '../project/useComposition'
import { normalizeHex } from '../../utils/paintColor'
export type PaintSwatch = { name: string; color: string }
export const paintPresets: PaintSwatch[] = [
  { name: 'Yellow', color: '#ffd426' }, { name: 'Pink', color: '#fc7f9e' }, { name: 'Red', color: '#e63136' },
  { name: 'White', color: '#ffffff' }, { name: 'Black', color: '#202723' }, { name: 'Blue', color: '#3586e8' },
]
export const useLivePaint = () => {
  const color = useEditorRef('live-paint-color', () => '#ffd426')
  const material = useEditorRef<'ink' | 'enig'>('live-paint-material', () => 'ink')
  const hoverSurface = useEditorRef<symbol | undefined>('live-paint-hover-surface', () => undefined)
  const pointer = useEditorRef<{ x: number; y: number; valid: boolean } | null>('live-paint-pointer', () => null)
  const previewColor = useEditorRef<string|undefined>('live-paint-preview-color',()=>undefined)
  const picking = useEditorRef('live-paint-picking', () => false), holdingAlt = useEditorRef('live-paint-alt', () => false)
  const sampler = computed(() => picking.value || holdingAlt.value)
  const recent = useEditorRef<string[]>('live-paint-recent', () => [])
  const feedback = useEditorRef('live-paint-feedback', () => '')
  const customPresets = useEditorRef<PaintSwatch[] | undefined>('live-paint-custom-presets', () => undefined)
  const { palette } = useComposition()
  const presets = computed(() => {
    const seen = new Set<string>()
    return [...palette.value, ...(customPresets.value ?? paintPresets)].flatMap(swatch => {
      if (!swatch || typeof swatch.name !== 'string' || typeof swatch.color !== 'string') return []
      const color = normalizeHex(swatch.color)
      if (!color || seen.has(color)) return []
      seen.add(color); return [{ name: swatch.name.slice(0, 80), color }]
    }).slice(0, 48)
  })
  const index = computed(() => presets.value.findIndex(preset => preset.color === color.value))
  const adjacent = computed(() => {
    const list = presets.value
    if (!list.length) return [color.value, color.value, color.value]
    return [list[index.value < 0 ? list.length - 1 : (index.value + list.length - 1) % list.length]!.color, color.value, list[(index.value + 1) % list.length]!.color]
  })
  const cycle = (offset: number) => {
    const list = presets.value
    if (!list.length) return
    const next = index.value < 0 ? (offset > 0 ? 0 : list.length - 1) : (index.value + offset + list.length) % list.length
    picking.value=false;feedback.value=''
    color.value = list[next]!.color
  }
  const rememberColor = (value = color.value) => {
    const normalized = normalizeHex(value)
    if (normalized) recent.value = [normalized, ...recent.value.filter(color => color !== normalized)].slice(0, 8)
  }
  return { color, previewColor, material, pointer, hoverSurface, picking, holdingAlt, sampler, recent, feedback, customPresets, rememberColor, adjacent, cycle, presets }
}
