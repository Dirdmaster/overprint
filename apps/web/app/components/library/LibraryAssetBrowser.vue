<script setup lang="ts">
import type { LibraryAsset } from '../../utils/library'
import LibraryArtworkPreview from './LibraryArtworkPreview.vue'
defineProps<{
  assets: LibraryAsset[]
  selectedAsset?: LibraryAsset
  previews: Record<string, { side: string; source: string }[]>
  busy: boolean
  canSaveRevision: boolean
}>()
const emit = defineEmits<{
  select: [id: string]
  place: [asset: LibraryAsset, linked: boolean]
  rename: [asset: LibraryAsset, name: string]
  revision: [asset: LibraryAsset]
  remove: [asset: LibraryAsset, trigger: HTMLElement]
}>()
</script>
<template>
  <div class="grid min-h-0 sm:grid-cols-[1fr_16rem]">
    <section
      aria-label="Saved compositions"
      class="library-content overflow-y-auto p-5"
    >
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <button
          v-for="asset in assets"
          :key="asset.id"
          class="overflow-hidden rounded-lg border-2 text-left transition-colors"
          :class="
            selectedAsset?.id === asset.id
              ? 'border-accent'
              : 'border-transparent hover:border-line'
          "
          :aria-label="`Browse ${asset.name}`"
          :aria-pressed="selectedAsset?.id === asset.id"
          @click="emit('select', asset.id)"
        >
          <div class="aspect-square overflow-hidden rounded-t-md">
            <LibraryArtworkPreview
              :sources="previews[asset.id] ?? []"
              :name="asset.name"
            />
          </div>
          <span class="block truncate bg-soft px-3 py-2 text-xs font-medium">
            {{ asset.name }}
          </span>
        </button>
      </div>
    </section>
    <aside
      v-if="selectedAsset"
      aria-label="Composition details"
      class="space-y-4 border-t border-line bg-soft/40 p-5 sm:border-t-0 sm:border-l"
    >
      <div class="aspect-[4/3] overflow-hidden rounded-lg">
        <LibraryArtworkPreview
          :sources="previews[selectedAsset.id] ?? []"
          :name="selectedAsset.name"
        />
      </div>
      <div>
        <h3 class="font-semibold">{{ selectedAsset.name }}</h3>
        <p class="mt-1 text-xs text-muted">
          {{ selectedAsset.revisions.length }} revision{{
            selectedAsset.revisions.length === 1 ? '' : 's'
          }}
          · {{ Number(selectedAsset.revisions.at(-1)!.snapshot.bounds.width.toFixed(1)) }} ×
          {{ Number(selectedAsset.revisions.at(-1)!.snapshot.bounds.height.toFixed(1)) }} mm
        </p>
      </div>
      <div class="space-y-2">
        <button
          class="primary-button min-h-10 w-full"
          :disabled="busy"
          :aria-label="`Place copy ${selectedAsset.name}`"
          @click="emit('place', selectedAsset, false)"
        >
          Place copy
        </button>
        <button
          class="min-h-10 w-full rounded-md border border-line text-xs font-medium hover:bg-soft"
          :disabled="busy"
          :aria-label="`Place linked ${selectedAsset.name}`"
          @click="emit('place', selectedAsset, true)"
        >
          Place linked
        </button>
        <p class="text-xs leading-relaxed text-muted">
          Copies are editable. Linked artwork can receive revisions after you review them.
        </p>
      </div>
      <details class="border-t border-line pt-3">
        <summary class="text-xs text-muted">Manage composition</summary>
        <div class="mt-3 space-y-3">
          <label class="block text-xs text-muted">
            Rename
            <input
              :value="selectedAsset.name"
              :aria-label="`Rename ${selectedAsset.name}`"
              maxlength="200"
              class="mt-1 w-full rounded border border-line bg-surface p-2 text-ink"
              @change="emit('rename', selectedAsset, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <button
            class="text-left text-xs hover:underline disabled:opacity-40"
            :disabled="busy || !canSaveRevision"
            :aria-label="`Save new revision of ${selectedAsset.name}`"
            @click="emit('revision', selectedAsset)"
          >
            Save board selection as revision
          </button>
          <button
            class="block text-xs text-red-500 hover:underline"
            :disabled="busy"
            :aria-label="`Delete library ${selectedAsset.name}`"
            @click="emit('remove', selectedAsset, $event.currentTarget as HTMLElement)"
          >
            Delete composition
          </button>
        </div>
      </details>
    </aside>
  </div>
</template>
<style scoped>
.library-content {
  max-height: 52svh;
}
</style>
