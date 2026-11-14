<script setup lang="ts">
import { computed } from 'vue'
import { Check, Plus } from '@lucide/vue'
import type { Artwork } from '../../utils/artwork'
import LibraryArtworkPreview from './LibraryArtworkPreview.vue'
const props = defineProps<{ graphics: Artwork[]; busy: boolean }>()
const captureIds = defineModel<string[]>('captureIds', { required: true })
const name = defineModel<string>('name', { required: true })
const emit = defineEmits<{ save: [] }>()
const boardSides = computed(() =>
  ['front', 'back']
    .map((side) => ({
      side,
      name: side === 'front' ? 'Front' : 'Back',
      graphics: props.graphics.filter((item) => item.side === side)
    }))
    .filter((group) => group.graphics.length)
)
</script>
<template>
  <div>
    <div class="library-content space-y-6 overflow-y-auto p-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="font-medium">Pick the artwork to save</h3>
          <p class="mt-1 text-xs text-muted">
            Combine graphics from either artboard into one composition.
          </p>
        </div>
        <span
          class="shrink-0 text-xs text-muted"
          aria-live="polite"
        >
          {{ captureIds.length }} selected
        </span>
      </div>
      <section
        v-for="group in boardSides"
        :key="group.side"
        :aria-label="`${group.name} artwork to save`"
      >
        <h4 class="mb-3 text-xs font-medium text-muted">
          {{ group.name }}
          <span class="ml-1 opacity-60">{{ group.graphics.length }}</span>
        </h4>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label
            v-for="item in group.graphics"
            :key="item.id"
            class="group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-colors"
            :class="
              captureIds.includes(item.id)
                ? 'border-accent'
                : 'border-transparent hover:border-line'
            "
          >
            <input
              v-model="captureIds"
              type="checkbox"
              :value="item.id"
              :aria-label="`Capture ${item.name} ${item.side}`"
              class="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
            />
            <div class="aspect-[4/3] overflow-hidden rounded-t-md">
              <LibraryArtworkPreview
                :sources="[{ side: item.side, source: item.source }]"
                :name="item.name"
              />
            </div>
            <span
              class="absolute top-2 right-2 flex size-5 items-center justify-center rounded-md border shadow-sm"
              :class="
                captureIds.includes(item.id)
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-white/50 bg-black/20 text-transparent'
              "
            >
              <Check :size="14" />
            </span>
            <span
              class="block truncate bg-soft px-3 py-2 text-xs peer-focus-visible:underline"
              :title="item.name"
            >
              {{ item.name }}
            </span>
            <span
              class="pointer-events-none absolute inset-0 rounded-md peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-inset"
            />
          </label>
        </div>
      </section>
      <p
        v-if="!graphics.length"
        class="py-12 text-center text-sm text-muted"
      >
        Add artwork to your board, then save it here to reuse.
      </p>
    </div>
    <form
      class="flex flex-wrap items-end gap-3 border-t border-line bg-soft/40 px-5 py-4"
      @submit.prevent="emit('save')"
    >
      <label class="min-w-0 flex-1 text-xs text-muted">
        Composition name
        <input
          v-model="name"
          aria-label="Composition name"
          maxlength="200"
          placeholder="Name your composition"
          class="mt-1.5 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </label>
      <button
        class="primary-button min-h-10 gap-2 disabled:opacity-40"
        :disabled="busy || !captureIds.length || !name.trim()"
        type="submit"
      >
        <Plus :size="16" />
        Save selection
      </button>
    </form>
  </div>
</template>
<style scoped>
.library-content {
  max-height: 52svh;
}
</style>
