export const useCanvasTools = () => {
  const selected = useState<'select' | 'hand' | 'paint'>('canvas-tool', () => 'select')
  const holdingSpace = useState('canvas-space', () => false)
  const holdingMiddle = useState('canvas-middle', () => false)
  const active = computed(() => holdingSpace.value || holdingMiddle.value ? 'hand' : selected.value)
  const keyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (document.querySelector('dialog[open]') || target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.code === 'Space') {
      // Preserve Space activation on normal controls, but use it for Hand on the canvas toolbar.
      if (target?.closest('button, a, summary') && !target.closest('[aria-label="Canvas tools"]')) return
      event.preventDefault()
      holdingSpace.value = true
    } else if (['v', 'm'].includes(event.key.toLowerCase())) selected.value = 'select'
    else if (event.key.toLowerCase() === 'k') selected.value = 'paint'
  }
  const releaseSpace = (event: KeyboardEvent) => { if (event.code === 'Space') holdingSpace.value = false }
  const resetSpace = () => { holdingSpace.value = false }
  onMounted(() => {
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', releaseSpace)
    window.addEventListener('blur', resetSpace)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', keyDown)
    window.removeEventListener('keyup', releaseSpace)
    window.removeEventListener('blur', resetSpace)
  })
  return { selected, active, holdingMiddle }
}
