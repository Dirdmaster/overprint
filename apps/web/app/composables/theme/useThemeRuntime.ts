// Install once at the application root; consumers share state without adding listeners.
export const useThemeRuntime = () => {
  const { mode, systemTheme, toggle } = useTheme()
  useHead({ htmlAttrs: { 'data-theme': mode } })
  let media: MediaQueryList | undefined
  const syncSystem = () => { systemTheme.value = media?.matches ? 'dark' : 'light' }
  const shortcut = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'd' || event.altKey || event.shiftKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
    event.preventDefault()
    if (!event.repeat) toggle()
  }
  onMounted(() => {
    media = window.matchMedia('(prefers-color-scheme: dark)')
    syncSystem()
    media.addEventListener('change', syncSystem)
    window.addEventListener('keydown', shortcut)
  })
  onBeforeUnmount(() => {
    media?.removeEventListener('change', syncSystem)
    window.removeEventListener('keydown', shortcut)
  })
}
