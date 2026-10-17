<script setup lang="ts">
import { ref, watch } from 'vue'
import TextFontPicker from './TextFontPicker.vue'
import type { Artwork } from '../../utils/artwork'
import { physicalText, defaultText, type TextDefinition } from '../../utils/textDrawing'
import { useTextDrawing } from '../../composables/artwork/useTextDrawing'
import { useDrawing } from '../../composables/artwork/useDrawing'
const props = defineProps<{ item: Artwork }>()
const { editText, cancelEdit, committing, committedItem } = useTextDrawing()
const { convertToSvg } = useDrawing()
const draft = ref<TextDefinition>(defaultText())
const error = ref(''),
  pending = ref(false)
let request = 0
let group = {}
watch(
  () => props.item,
  (item) => {
    if (committing.value || item === committedItem.value) return
    cancelEdit()
    request++
    group = {}
    draft.value = physicalText(item)
    error.value = ''
    pending.value = false
  },
  { immediate: true, deep: true, flush: 'sync' }
)
const apply = async (event?: Event) => {
  if (event?.type === 'input' && event.target instanceof HTMLSelectElement) return
  if (event instanceof InputEvent && event.isComposing) return
  const operation = ++request
  pending.value = true
  try {
    await editText(props.item.id, { ...draft.value }, group)
    if (operation === request) {
      error.value = ''
      const saved = committedItem.value?.drawing
      if (saved?.type === 'text') draft.value.google = saved.google
    }
  } catch (reason) {
    if (operation === request)
      error.value = reason instanceof Error ? reason.message : 'Unable to outline text.'
  } finally {
    if (operation === request) pending.value = false
  }
}
</script>
<template>
  <form
    class="mt-3 space-y-2"
    @submit.prevent
    @input="apply"
    @compositionend="apply"
    @focusin="group = {}"
  >
    <fieldset class="space-y-2">
      <legend class="mb-2 font-medium">Editable text</legend>
      <label class="flex flex-col gap-1 text-muted">
        Content
        <textarea
          v-model="draft.content"
          aria-label="Text content"
          maxlength="500"
          rows="3"
          class="w-full rounded bg-soft p-2 text-ink"
        />
      </label>
      <TextFontPicker
        :key="item.id"
        :value="draft"
        @select="
          (value) => {
            draft = { ...draft, ...value }
            group = {}
            apply()
          }
        "
      />
      <label class="flex flex-col gap-1 text-muted">
        Size (mm, em)
        <input
          v-model.number="draft.size"
          type="number"
          min="0.1"
          max="100"
          step="0.1"
          aria-label="Text size (mm)"
          class="w-full rounded bg-soft p-2 text-ink"
        />
      </label>
      <label class="flex flex-col gap-1 text-muted">
        Alignment
        <select
          v-model="draft.align"
          @change="apply"
          aria-label="Text alignment"
          class="w-full rounded bg-soft p-2 text-ink"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-muted">
        Letter spacing (mm)
        <input
          v-model.number="draft.letterSpacing"
          type="number"
          min="0"
          max="20"
          step="0.1"
          aria-label="Text letter spacing (mm)"
          class="w-full rounded bg-soft p-2 text-ink"
        />
      </label>
      <label class="flex flex-col gap-1 text-muted">
        Line spacing (multiple)
        <input
          v-model.number="draft.lineHeight"
          type="number"
          min="1"
          max="3"
          step="0.1"
          aria-label="Text line spacing"
          class="w-full rounded bg-soft p-2 text-ink"
        />
      </label>
      <label class="flex flex-col gap-1 text-muted">
        Fill (hex)
        <input
          v-model="draft.fill"
          aria-label="Text fill"
          class="w-full rounded bg-soft p-2 text-ink"
        />
      </label>
    </fieldset>
    <p
      v-if="pending"
      role="status"
      class="sr-only"
    >
      Updating text…
    </p>
    <p
      v-if="error"
      role="alert"
      class="text-red-600"
    >
      {{ error }}
    </p>
    <p class="text-xs text-muted">
      Latin text and selected symbols. Font size is the em size, not printed letter height. Convert
      to SVG before Live Paint; conversion can be undone.
    </p>
    <button
      type="button"
      class="rounded bg-soft p-2"
      :disabled="pending"
      @click="convertToSvg(item.id)"
    >
      Convert to SVG
    </button>
  </form>
</template>
