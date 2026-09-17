export const paintPresets = [
  { name: 'Yellow', color: '#ffd426' }, { name: 'Pink', color: '#fc7f9e' }, { name: 'Red', color: '#e63136' },
  { name: 'White', color: '#ffffff' }, { name: 'Black', color: '#202723' }, { name: 'Blue', color: '#3586e8' },
]

export const useLivePaint = () => {
  const color = useState('live-paint-color', () => '#ffd426')
  const pointer = useState<{ x: number; y: number; valid: boolean } | null>('live-paint-pointer', () => null)
  const index = computed(() => Math.max(0, paintPresets.findIndex(preset => preset.color === color.value)))
  const adjacent = computed(() => [paintPresets[(index.value + paintPresets.length - 1) % paintPresets.length]!.color, color.value, paintPresets[(index.value + 1) % paintPresets.length]!.color])
  const cycle = (offset: number) => { color.value = paintPresets[(index.value + offset + paintPresets.length) % paintPresets.length]!.color }
  return { color, pointer, adjacent, cycle, presets: paintPresets }
}
