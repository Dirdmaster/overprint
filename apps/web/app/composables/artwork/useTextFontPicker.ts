import { computed, ref, watch, onScopeDispose } from 'vue'
import { defaultText, type TextDefinition } from '../../utils/textDrawing'
import { outlineText } from '../../utils/outlineText'
type Family = {
  family: string
  category: string
  version: string
  variants: { variant: string; id: string }[]
}
type Choice = Pick<TextDefinition, 'font' | 'weight' | 'google'>
export const useTextFontPicker = (
  current: () => TextDefinition,
  onSelect: (choice: Choice) => void
) => {
  const open = ref(false),
    query = ref(''),
    families = ref<Family[]>([]),
    total = ref(0)
  const loading = ref(false),
    pending = ref(false),
    error = ref(''),
    preview = ref(''),
    previewName = ref('')
  const chosenFamily = ref<Family>()
  const familyName = computed(() => current().google?.family ?? 'Geist (legacy)')
  const currentVariant = computed(() => current().google?.variant ?? String(current().weight))
  const compatibleFamily = computed(() => {
    const saved = current().google
    const family = chosenFamily.value
    return saved &&
      family?.family === saved.family &&
      family.version === saved.version &&
      family.variants.some((file) => file.variant === saved.variant && file.id === saved.id)
      ? family
      : undefined
  })
  const variants = computed(() => {
    const saved = current().google
    return saved
      ? (compatibleFamily.value?.variants.map((item) => item.variant) ?? [saved.variant])
      : [String(current().weight)]
  })
  const styleName = (variant: string) => {
    const weight = parseInt(variant) || 400
    const names: Record<number, string> = {
      100: 'Thin',
      200: 'Extra light',
      300: 'Light',
      400: 'Regular',
      500: 'Medium',
      600: 'Semibold',
      700: 'Bold',
      800: 'Extra bold',
      900: 'Black'
    }
    return `${names[weight] ?? variant}${variant.includes('italic') ? ' italic' : ''}`
  }
  let request = 0,
    operation = 0,
    previewRequest = 0
  let previewBusy = false
  let timer: ReturnType<typeof setTimeout> | undefined,
    previewTimer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined, stylesController: AbortController | undefined
  let queuedPreview: { value: Choice; token: number } | undefined
  let retryAction: () => unknown = () => search()
  const search = async (append = false) => {
    const token = ++request
    controller?.abort()
    controller = new AbortController()
    loading.value = true
    error.value = ''
    retryAction = () => search(append)
    try {
      const response = await fetch(
        `/api/fonts/catalog?${new URLSearchParams({ q: query.value, offset: String(append ? families.value.length : 0) })}`,
        { signal: controller.signal }
      )
      if (!response.ok)
        throw new Error(
          response.status === 503
            ? 'Google Fonts is not configured on this server.'
            : 'Unable to load Google Fonts. Retry when the service is available.'
        )
      const result = (await response.json()) as { families: Family[]; total: number }
      if (token !== request) return
      families.value = append ? [...families.value, ...result.families] : result.families
      total.value = result.total
      const saved = current().google
      const matching =
        saved &&
        result.families.find(
          (item) =>
            item.family === saved.family &&
            item.version === saved.version &&
            item.variants.some((file) => file.variant === saved.variant && file.id === saved.id)
        )
      if (matching) chosenFamily.value = matching
    } catch (reason) {
      if (token === request)
        error.value = reason instanceof Error ? reason.message : 'Unable to load fonts.'
    } finally {
      if (token === request) loading.value = false
    }
  }
  watch(query, () => {
    ++request
    controller?.abort()
    clearTimeout(timer)
    families.value = []
    total.value = 0
    timer = setTimeout(() => search(), 250)
  })
  watch(open, (value) => {
    if (value) void search()
    else {
      ++operation
      pending.value = false
      ++request
      ++previewRequest
      queuedPreview = undefined
      controller?.abort()
      clearTimeout(timer)
      clearTimeout(previewTimer)
    }
  })
  const choice = (
    family: Family,
    variant = family.variants.find((item) => item.variant === 'regular')?.variant ??
      family.variants[0]!.variant
  ): Choice => ({
    font: 'google-fonts-v1',
    weight: parseInt(variant) || 400,
    google: {
      family: family.family,
      version: family.version,
      variant,
      id: family.variants.find((item) => item.variant === variant)!.id
    }
  })
  const renderPreview = async (value: Choice) => {
    const result = await outlineText({
      ...defaultText(),
      ...value,
      content: 'Aa Bb 123',
      fill: '#ffffff'
    })
    return `data:image/svg+xml,${encodeURIComponent(result.source)}`
  }
  const apply = async (value: Choice, family?: Family) => {
    const token = ++operation
    const original = JSON.stringify(current())
    ++previewRequest
    queuedPreview = undefined
    clearTimeout(previewTimer)
    pending.value = true
    error.value = ''
    retryAction = () => apply(value, family)
    try {
      const source = await renderPreview(value)
      if (token !== operation || original !== JSON.stringify(current())) return
      chosenFamily.value = family
      preview.value = source
      previewName.value = value.google?.family ?? ''
      onSelect(value)
      open.value = false
    } catch (reason) {
      if (token === operation)
        error.value = reason instanceof Error ? reason.message : 'Unable to load this font.'
    } finally {
      if (token === operation) pending.value = false
    }
  }
  // One background preview at a time; the latest highlight replaces queued work.
  const drainPreview = async () => {
    if (previewBusy || !queuedPreview) return
    const { value, token } = queuedPreview
    queuedPreview = undefined
    previewBusy = true
    try {
      const source = await renderPreview(value)
      if (token === previewRequest) {
        preview.value = source
        previewName.value = value.google?.family ?? ''
      }
    } catch {
      /* A hover preview never changes artwork or interrupts selection. */
    } finally {
      previewBusy = false
      if (queuedPreview) void drainPreview()
    }
  }
  const highlight = (event: { value: unknown } | undefined) => {
    const token = ++previewRequest
    clearTimeout(previewTimer)
    queuedPreview = undefined
    if (!event || pending.value) return
    const family = families.value.find((item) => item.family === event.value)
    const value = family ? choice(family) : undefined
    if (!value) return
    previewTimer = setTimeout(() => {
      queuedPreview = { value, token }
      void drainPreview()
    }, 250)
  }
  const loadStyles = async () => {
    const saved = current().google
    if (!saved || compatibleFamily.value) return
    stylesController?.abort()
    stylesController = new AbortController()
    try {
      const response = await fetch(
        `/api/fonts/catalog?${new URLSearchParams({ q: saved.family, offset: '0' })}`,
        { signal: stylesController.signal }
      )
      if (!response.ok) return
      const result = (await response.json()) as { families: Family[] }
      const family = result.families.find(
        (item) =>
          item.family === saved.family &&
          item.version === saved.version &&
          item.variants.some((file) => file.variant === saved.variant && file.id === saved.id)
      )
      if (family && current().google === saved) chosenFamily.value = family
    } catch {
      /* The pinned style remains available when the catalogue is offline. */
    }
  }
  const selectStyle = (event: Event) => {
    const variant = (event.target as HTMLSelectElement).value
    if (compatibleFamily.value)
      void apply(choice(compatibleFamily.value, variant), compatibleFamily.value)
  }
  watch(
    current,
    () => {
      ++operation
      pending.value = false
      error.value = ''
    },
    { deep: true, flush: 'sync' }
  )
  onScopeDispose(() => {
    ++request
    ++operation
    ++previewRequest
    controller?.abort()
    stylesController?.abort()
    queuedPreview = undefined
    clearTimeout(timer)
    clearTimeout(previewTimer)
  })

  return {
    open,
    query,
    families,
    total,
    loading,
    pending,
    error,
    preview,
    previewName,
    familyName,
    currentVariant,
    variants,
    styleName,
    search,
    choice,
    apply,
    highlight,
    selectStyle,
    loadStyles,
    retry: () => retryAction()
  }
}
