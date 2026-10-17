<script setup lang="ts">
import { ref, watch, onScopeDispose } from 'vue'
import { defaultText, type TextDefinition, type GoogleFontIdentity } from '../../utils/textDrawing'
import { outlineText } from '../../utils/outlineText'
type Family = {
  family: string
  category: string
  version: string
  variants: { variant: string; id: string }[]
}
const props = defineProps<{ value: TextDefinition }>()
const emit = defineEmits<{ select: [value: Pick<TextDefinition, 'font' | 'weight' | 'google'>] }>()
const open = ref(false),
  query = ref(''),
  families = ref<Family[]>([]),
  total = ref(0),
  offset = ref(0)
const loading = ref(false),
  error = ref(''),
  failedPreview = ref(false),
  selected = ref<Family>(),
  variant = ref(''),
  preview = ref(''),
  previewing = ref(false)
let request = 0,
  previewRequest = 0,
  timer: ReturnType<typeof setTimeout> | undefined,
  controller: AbortController | undefined
const search = async (start = 0) => {
  const operation = ++request
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  failedPreview.value = false
  try {
    const response = await fetch(
      `/api/fonts/catalog?${new URLSearchParams({ q: query.value, offset: String(start) })}`,
      { signal: controller.signal }
    )
    if (!response.ok)
      throw new Error(
        response.status === 503
          ? 'Google Fonts is not configured on this server. Bundled fonts are available.'
          : 'Unable to load Google Fonts. Retry or use a bundled font.'
      )
    const result = (await response.json()) as { families: Family[]; total: number; offset: number }
    if (operation !== request) return
    families.value = result.families
    total.value = result.total
    offset.value = result.offset
  } catch (reason) {
    if (operation === request)
      error.value = reason instanceof Error ? reason.message : 'Unable to load fonts.'
  } finally {
    if (operation === request) loading.value = false
  }
}
watch(query, () => {
  request++
  controller?.abort()
  clearTimeout(timer)
  timer = setTimeout(() => search(), 250)
})
watch(open, (value) => {
  if (value) void search()
  else {
    request++
    controller?.abort()
    clearTimeout(timer)
  }
})
const identity = (): GoogleFontIdentity | undefined => {
  const family = selected.value,
    file = family?.variants.find((item) => item.variant === variant.value)
  return family && file
    ? { family: family.family, version: family.version, variant: file.variant, id: file.id }
    : undefined
}
const fontChoice = () => ({
  font: 'google-fonts-v1' as const,
  weight: /^(regular|italic)$/.test(variant.value) ? 400 : parseInt(variant.value),
  google: identity()
})
const loadPreview = async () => {
  const operation = ++previewRequest
  preview.value = ''
  error.value = ''
  failedPreview.value = false
  previewing.value = false
  if (!identity()) return
  previewing.value = true
  try {
    const outlined = await outlineText({
      ...defaultText(),
      ...fontChoice(),
      content: 'Aa Bb 123',
      fill: '#ffffff'
    })
    if (operation === previewRequest)
      preview.value = `data:image/svg+xml,${encodeURIComponent(outlined.source)}`
  } catch (reason) {
    if (operation === previewRequest) {
      failedPreview.value = true
      error.value = reason instanceof Error ? reason.message : 'Preview unavailable.'
    }
  } finally {
    if (operation === previewRequest) previewing.value = false
  }
}
watch([selected, variant], loadPreview)
const retry = () => (failedPreview.value ? loadPreview() : search(offset.value))
const choose = (family: Family) => {
  error.value = ''
  selected.value = family
  variant.value = family.variants[0]?.variant ?? ''
}
const useFont = () => {
  emit('select', fontChoice())
  open.value = false
}
const bundled = (event: Event) =>
  emit('select', {
    font: 'geist-latin-v1',
    weight: Number((event.target as HTMLSelectElement).value),
    google: undefined
  })
onScopeDispose(() => {
  request++
  previewRequest++
  controller?.abort()
  clearTimeout(timer)
})
</script>
<template>
  <div
    class="space-y-2"
    @input.stop
    @change.stop
    @compositionend.stop
  >
    <label class="flex flex-col gap-1 text-muted">
      Font
      <select
        :value="value.font === 'geist-latin-v1' ? value.weight : 'google'"
        aria-label="Text font"
        class="w-full rounded bg-soft p-2 text-ink"
        @change="bundled"
      >
        <option
          v-if="value.google"
          value="google"
          disabled
        >
          {{ value.google.family }} {{ value.google.variant }}
        </option>
        <option :value="400">Geist Regular</option>
        <option :value="700">Geist Bold</option>
      </select>
    </label>
    <button
      type="button"
      class="rounded bg-soft p-2"
      :aria-expanded="open"
      @click="open = !open"
    >
      Browse Google Fonts
    </button>
    <div
      v-if="open"
      class="space-y-2 rounded border border-current p-2"
      aria-label="Google Fonts picker"
    >
      <label class="flex flex-col gap-1">
        Search font families
        <input
          v-model="query"
          type="search"
          maxlength="100"
          class="w-full rounded bg-soft p-2"
        />
      </label>
      <p v-if="loading">Loading fonts…</p>
      <p
        v-if="error"
        role="alert"
      >
        {{ error }}
        <button
          type="button"
          class="underline"
          @click="retry"
        >
          Retry
        </button>
      </p>
      <p v-if="!loading && !error && !families.length">No matching fonts.</p>
      <ul class="max-h-48 space-y-1 overflow-y-auto">
        <li
          v-for="family in families"
          :key="family.family"
        >
          <button
            type="button"
            class="w-full rounded bg-soft p-2 text-left"
            :aria-pressed="selected?.family === family.family"
            @click="choose(family)"
          >
            {{ family.family }}
          </button>
        </li>
      </ul>
      <div
        v-if="total > families.length"
        class="flex items-center gap-2"
      >
        <button
          type="button"
          :disabled="loading || offset === 0"
          @click="search(Math.max(0, offset - 40))"
        >
          Previous fonts
        </button>
        <span>{{ offset + 1 }}–{{ offset + families.length }} of {{ total }}</span>
        <button
          type="button"
          :disabled="loading || offset + families.length >= total"
          @click="search(offset + 40)"
        >
          Next fonts
        </button>
      </div>
      <template v-if="selected">
        <label class="flex flex-col gap-1">
          Font variant
          <select
            v-model="variant"
            class="rounded bg-soft p-2"
          >
            <option
              v-for="item in selected.variants"
              :key="item.variant"
              :value="item.variant"
            >
              {{ item.variant }}
            </option>
          </select>
        </label>
        <div class="flex h-16 items-center justify-center rounded bg-neutral-900 text-white">
          <span v-if="previewing">Loading preview…</span>
          <img
            v-else-if="preview"
            :src="preview"
            alt="Font preview Aa Bb 123"
            class="max-h-12 max-w-full"
          />
        </div>
        <button
          type="button"
          class="rounded bg-soft p-2"
          :disabled="!preview || previewing"
          @click="useFont"
        >
          Use {{ selected.family }}
        </button>
      </template>
      <p class="text-xs text-muted">
        Fonts download on demand. Saved artwork keeps its outlines offline.
      </p>
    </div>
  </div>
</template>
