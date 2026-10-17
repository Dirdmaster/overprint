<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Artwork } from '../../utils/artwork'
import { physicalText, defaultText, type TextDefinition } from '../../utils/textDrawing'
import { useTextDrawing } from '../../composables/artwork/useTextDrawing'
import { useDrawing } from '../../composables/artwork/useDrawing'
const props = defineProps<{ item: Artwork }>()
const { editText } = useTextDrawing()
const { convertToSvg } = useDrawing()
const draft = ref<TextDefinition>(defaultText())
const error = ref(''),
  pending = ref(false)
watch(
  () => props.item,
  (item) => {
    draft.value = physicalText(item)
    error.value = ''
  },
  { immediate: true, deep: true }
)
const apply = async () => {
  pending.value = true
  try {
    await editText(props.item.id, draft.value)
    error.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Unable to outline text.'
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <form
    class="mt-3 space-y-2"
    @submit.prevent="apply"
  >
    <fieldset
      :disabled="pending"
      class="space-y-2"
    >
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
      <label class="flex flex-col gap-1 text-muted">
        Font
        <select
          v-model.number="draft.weight"
          aria-label="Text font"
          class="w-full rounded bg-soft p-2 text-ink"
        >
          <option :value="400">Geist Regular</option>
          <option :value="700">Geist Bold</option>
        </select>
      </label>
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
      <button
        type="submit"
        class="rounded bg-accent p-2 text-on-accent"
      >
        {{ pending ? 'Outlining…' : 'Apply text' }}
      </button>
    </fieldset>
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
