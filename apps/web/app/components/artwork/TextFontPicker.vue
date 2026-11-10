<script setup lang="ts">
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxTrigger,
  ComboboxInput,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem
} from 'reka-ui'
import { ChevronsUpDown, Search, Check } from '@lucide/vue'
import type { TextDefinition } from '../../utils/textDrawing'
import { useTextFontPicker } from '../../composables/artwork/useTextFontPicker'
const props = defineProps<{ value: TextDefinition }>()
const emit = defineEmits<{ select: [value: Pick<TextDefinition, 'font' | 'weight' | 'google'>] }>()
const {
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
  retry
} = useTextFontPicker(
  () => props.value,
  (value) => emit('select', value)
)
</script>
<template>
  <div
    class="space-y-2"
    @input.stop
    @change.stop
    @compositionend.stop
  >
    <div class="space-y-1">
      <span class="text-muted">Font family</span>
      <ComboboxRoot
        v-model:open="open"
        :model-value="value.google?.family"
        :ignore-filter="true"
        :loop="true"
        :reset-search-term-on-select="false"
        :reset-search-term-on-blur="false"
        @highlight="highlight"
      >
        <ComboboxAnchor>
          <ComboboxTrigger
            role="combobox"
            aria-label="Font family"
            :tabindex="0"
            class="flex w-full items-center justify-between gap-2 rounded border border-line bg-soft px-3 py-2 text-left text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
            @keydown.down.prevent="open = true"
            @keydown.up.prevent="open = true"
          >
            <span class="truncate">{{ familyName }}</span>
            <ChevronsUpDown
              aria-hidden="true"
              class="size-4 shrink-0 text-muted"
            />
          </ComboboxTrigger>
        </ComboboxAnchor>
        <ComboboxContent
          position="popper"
          align="end"
          :side-offset="6"
          :collision-padding="12"
          class="z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-line bg-surface text-sm text-ink shadow-xl"
          style="max-height: min(32rem, var(--reka-combobox-content-available-height))"
          aria-label="Font families"
        >
          <div class="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search
              aria-hidden="true"
              class="size-4 shrink-0 text-muted"
            />
            <ComboboxInput
              v-model="query"
              aria-label="Search font families"
              placeholder="Search Google Fonts…"
              :maxlength="100"
              class="w-full rounded bg-soft px-3 py-2 text-ink outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <ComboboxViewport
            class="min-h-0 flex-1 overflow-y-auto p-1"
            style="max-height: 16rem"
          >
            <p class="px-2 py-2 text-xs text-muted">Google Fonts</p>
            <ComboboxItem
              v-for="family in families"
              :key="family.family"
              :value="family.family"
              :aria-label="family.family"
              @select.prevent="apply(choice(family), family)"
              class="flex cursor-default items-center justify-between gap-2 rounded px-3 py-2 outline-none data-[highlighted]:bg-soft data-[state=checked]:text-accent"
            >
              <span class="min-w-0 flex-1 truncate">{{ family.family }}</span>
              <Check
                v-if="value.google?.family === family.family"
                aria-hidden="true"
                class="size-4 shrink-0"
              />
              <span class="text-xs text-muted">{{ family.category }}</span>
            </ComboboxItem>
            <p
              v-if="loading"
              role="status"
              class="p-3 text-muted"
            >
              Loading fonts…
            </p>
            <p
              v-else-if="!families.length && !error"
              class="p-3 text-muted"
            >
              No matching Google Fonts.
            </p>
            <button
              v-if="families.length < total"
              type="button"
              :disabled="loading"
              class="w-full rounded px-3 py-2 text-accent hover:bg-soft"
              @click="search(true)"
            >
              Load more fonts
            </button>
          </ComboboxViewport>
          <p
            v-if="error"
            role="alert"
            class="border-t border-line px-3 py-2 text-xs text-muted"
          >
            {{ error }}
            <button
              type="button"
              class="underline"
              @click="retry()"
            >
              Retry
            </button>
          </p>
          <div
            v-if="preview"
            class="border-t border-line p-3"
          >
            <p class="mb-2 truncate text-xs text-muted">{{ previewName }}</p>
            <div class="flex h-12 items-center justify-center rounded bg-neutral-900">
              <img
                :src="preview"
                alt="Font preview Aa Bb 123"
                class="max-h-10 max-w-full"
              />
            </div>
          </div>
          <p class="border-t border-line px-3 py-2 text-xs text-muted">
            Fonts download on demand. Saved outlines work offline.
          </p>
        </ComboboxContent>
      </ComboboxRoot>
    </div>
    <label class="flex flex-col gap-1 text-muted">
      Style
      <select
        aria-label="Font style"
        :value="currentVariant"
        :disabled="pending || !value.google"
        class="w-full rounded bg-soft p-2 text-ink"
        @focus="loadStyles"
        @change="selectStyle"
      >
        <option
          v-for="variant in variants"
          :key="variant"
          :value="variant"
        >
          {{ styleName(variant) }}
        </option>
      </select>
    </label>
    <p
      v-if="pending"
      role="status"
      class="sr-only"
    >
      Loading font…
    </p>
    <p
      v-if="error && !open"
      role="alert"
      class="text-xs text-muted"
    >
      {{ error }}
      <button
        type="button"
        class="underline"
        @click="retry()"
      >
        Retry
      </button>
    </p>
  </div>
</template>
