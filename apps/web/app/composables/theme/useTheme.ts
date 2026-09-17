type ThemePreference = 'light' | 'dark' | 'system'

export const useTheme = () => {
  const preference = useCookie<ThemePreference>('overprint-theme', {
    default: () => 'system',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  const systemTheme = useState<'light' | 'dark'>('system-theme', () => 'light')
  const mode = computed(() => ['light', 'dark'].includes(preference.value) ? preference.value : 'system')
  const theme = computed(() => mode.value === 'system' ? systemTheme.value : mode.value)
  const toggle = () => { preference.value = theme.value === 'dark' ? 'light' : 'dark' }
  const followSystem = () => { preference.value = 'system' }
  return { mode, theme, systemTheme, toggle, followSystem }
}
