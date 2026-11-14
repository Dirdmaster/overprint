<script setup lang="ts">
import { Search, X, Images } from '@lucide/vue'
import LibraryCapturePicker from './LibraryCapturePicker.vue'
import LibraryAssetBrowser from './LibraryAssetBrowser.vue'
import { artworkRows } from '../../utils/artwork'
import { svgImageUrl } from '../../utils/svgImage'
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useLibrary } from '../../composables/artwork/useLibrary'
import { useArtwork } from '../../composables/artwork/useArtwork'
import { snapshotSvg, type LibraryAsset } from '../../utils/library'
const { items, selectionIds } = useArtwork()
const {
  assets,
  error,
  busy,
  selectedInstance,
  refresh,
  save,
  rename,
  remove,
  place,
  detach,
  update
} = useLibrary()
const libraryDialog = ref<HTMLDialogElement>()
const deleteDialog = ref<HTMLDialogElement>()
const updateDialog = ref<HTMLDialogElement>()
const search = ref(''),
  name = ref(''),
  captureIds = ref<string[]>([])
const mode = ref<'saved' | 'capture'>('saved')
const selectedAssetId = ref<string>()
const selectedAsset = computed(
  () => filtered.value.find((asset) => asset.id === selectedAssetId.value) ?? filtered.value[0]
)
const previews = ref<Record<string, { side: string; source: string }[]>>({}),
  pending = ref<LibraryAsset>()
const deleting = ref<LibraryAsset>()
const requestDelete = (asset: LibraryAsset, trigger: HTMLElement) => {
  // Safari does not focus buttons on mouse click. Give the nested dialog a return target.
  trigger.focus()
  deleting.value = asset
}
watch(deleting, async (value) => {
  await nextTick()
  if (value) deleteDialog.value?.showModal()
  else deleteDialog.value?.close()
})
watch(pending, async (value) => {
  await nextTick()
  if (value) updateDialog.value?.showModal()
  else updateDialog.value?.close()
})
onMounted(refresh)
const confirmDelete = async () => {
  if (deleting.value) await remove(deleting.value)
  deleting.value = undefined
}
const before = ref(''),
  after = ref(''),
  previewSide = ref('front')
const currentAsset = computed(() =>
  assets.value.find((asset) => asset.id === selectedInstance.value?.library?.assetId)
)
const available = computed(
  () =>
    currentAsset.value &&
    currentAsset.value.revisions.at(-1)?.id !== selectedInstance.value?.library?.revisionId
)
const filtered = computed(() =>
  assets.value.filter((asset) => asset.name.toLowerCase().includes(search.value.toLowerCase()))
)
const graphics = computed(() => items.value.filter((item) => !item.nativeSilk && !item.kind))
const thumbnails = async () => {
  const entries = await Promise.all(
    assets.value.map(async (asset) => {
      const snapshot = asset.revisions.at(-1)!.snapshot
      const sides = ['front', 'back'].filter((side) =>
        snapshot.artwork.some((item) => item.side === side && !item.kind)
      )
      return [
        asset.id,
        await Promise.all(
          sides.map(async (side) => ({ side, source: await snapshotSvg(snapshot, side) }))
        )
      ] as const
    })
  )
  previews.value = Object.fromEntries(entries)
}
const show = async (event?: MouseEvent) => {
  if (event?.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  libraryDialog.value?.showModal()
  // A selected folder captures its graphics, while the picker always shows the actual artwork.
  const captured = new Set(selectionIds.value)
  for (const side of ['front', 'back']) {
    for (const { item } of artworkRows(items.value, side, true)) {
      if (item.parentId && captured.has(item.parentId)) captured.add(item.id)
    }
  }
  captureIds.value = graphics.value.filter((item) => captured.has(item.id)).map((item) => item.id)
  await refresh()
  mode.value = assets.value.length ? 'saved' : 'capture'
  await thumbnails()
}
onMounted(async () => {
  if (new URLSearchParams(window.location.search).get('library') === '1') {
    await show()
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }
})
const saveSelection = async (asset?: LibraryAsset) => {
  const previousIds = new Set(assets.value.map((value) => value.id))
  const captured = new Set(captureIds.value)
  // Preserve complete folders and layers without capturing unchecked siblings.
  for (const side of ['front', 'back']) {
    for (const { item } of artworkRows(items.value, side, true).reverse()) {
      if (!item.kind) continue
      const children = items.value.filter((child) => child.parentId === item.id)
      if (children.length && children.every((child) => captured.has(child.id)))
        captured.add(item.id)
    }
  }
  await save(asset?.name ?? name.value, [...captured], asset)
  if (error.value) return
  selectedAssetId.value = asset?.id ?? assets.value.find((value) => !previousIds.has(value.id))?.id
  await thumbnails()
  search.value = ''
  mode.value = 'saved'
}
const selectAll = () => {
  captureIds.value = graphics.value.map((item) => item.id)
}
const clearSelection = () => {
  captureIds.value = []
}
const preview = async (event: MouseEvent) => {
  ;(event.currentTarget as HTMLElement).focus()
  await refresh()
  if (!selectedInstance.value) return
  if (!currentAsset.value) {
    error.value = 'Library source unavailable. The saved snapshot remains editable after detaching.'
    return
  }
  pending.value = currentAsset.value
  previewSide.value = selectedInstance.value.side
  await renderPreview()
}
const renderPreview = async () => {
  if (!pending.value || !selectedInstance.value) return
  before.value = await snapshotSvg(selectedInstance.value.library!.snapshot, previewSide.value)
  after.value = await snapshotSvg(pending.value.revisions.at(-1)!.snapshot, previewSide.value)
}
const applyUpdate = async () => {
  if (pending.value) await update(pending.value)
  pending.value = undefined
}
const imageUrl = svgImageUrl
</script>
<template>
  <section
    class="border-t border-line p-3"
    aria-label="Reusable compositions"
  >
    <button
      class="w-full rounded bg-soft p-2 text-left font-medium"
      @click="show"
    >
      Library
    </button>
    <div
      v-if="selectedInstance"
      class="mt-2 space-y-2"
    >
      <p>Linked composition. Detach to edit its contents.</p>
      <button
        class="rounded bg-soft p-2"
        :disabled="busy"
        @click="detach"
      >
        Detach instance
      </button>
      <button
        class="rounded bg-soft p-2"
        :disabled="busy"
        @click="preview"
      >
        Check for updates
      </button>
      <p v-if="available">Update available</p>
    </div>
    <p
      v-if="error"
      role="alert"
      class="mt-2 text-red-500"
    >
      {{ error }}
    </p>
  </section>
  <dialog
    ref="libraryDialog"
    aria-label="Composition library"
    class="m-auto max-h-[85svh] w-5xl max-w-[calc(100%-2rem)] overflow-auto rounded-2xl border border-line bg-surface text-ink shadow-xl backdrop:bg-black/50"
  >
    <header class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 class="text-lg font-semibold">Composition library</h2>
        <p class="mt-1 text-xs text-muted">Your reusable artwork, saved on this device.</p>
      </div>
      <button
        class="icon-button"
        aria-label="Close library"
        @click="libraryDialog?.close()"
      >
        <X :size="18" />
      </button>
    </header>
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
      <div
        class="flex gap-1 rounded-lg bg-soft p-1"
        aria-label="Library views"
      >
        <button
          class="rounded-md px-3 py-1.5 text-sm"
          :class="mode === 'saved' ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
          :aria-pressed="mode === 'saved'"
          @click="mode = 'saved'"
        >
          Saved
          <span class="ml-1 text-xs text-muted">{{ assets.length }}</span>
        </button>
        <button
          class="rounded-md px-3 py-1.5 text-sm"
          :class="mode === 'capture' ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
          :aria-pressed="mode === 'capture'"
          @click="mode = 'capture'"
        >
          <span>From this board</span>
        </button>
      </div>
      <label
        v-if="mode === 'saved'"
        class="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-lg bg-soft px-3 py-2 sm:max-w-64 sm:basis-auto"
      >
        <Search
          :size="16"
          class="shrink-0 text-muted"
        />
        <input
          v-model="search"
          aria-label="Search library"
          placeholder="Search artwork"
          class="min-w-0 w-full bg-transparent text-sm outline-none"
        />
      </label>
      <div
        v-else
        class="flex items-center gap-3 text-xs"
      >
        <button
          class="text-muted hover:text-ink"
          @click="selectAll"
        >
          Select all
        </button>
        <button
          class="text-muted hover:text-ink"
          :disabled="!captureIds.length"
          @click="clearSelection"
        >
          Clear
        </button>
      </div>
    </div>
    <LibraryCapturePicker
      v-if="mode === 'capture'"
      v-model:capture-ids="captureIds"
      v-model:name="name"
      :graphics="graphics"
      :busy="busy"
      @save="saveSelection()"
    />
    <LibraryAssetBrowser
      v-else-if="filtered.length"
      :assets="filtered"
      :selected-asset="selectedAsset"
      :previews="previews"
      :busy="busy"
      :can-save-revision="!!captureIds.length"
      @select="selectedAssetId = $event"
      @place="place"
      @rename="rename"
      @revision="saveSelection"
      @remove="requestDelete"
    />
    <div
      v-else
      class="flex flex-col items-center px-5 py-16 text-center"
    >
      <Images
        :size="36"
        class="mb-4 text-muted"
        :stroke-width="1.25"
      />
      <h3 class="font-medium">
        {{ search ? 'No matching artwork' : 'Your artwork, ready to reuse' }}
      </h3>
      <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {{
          search
            ? 'Try another name to find your composition.'
            : 'Pick graphics from your board and save your first composition.'
        }}
      </p>
      <button
        v-if="!search"
        class="primary-button mt-5 min-h-10"
        @click="mode = 'capture'"
      >
        Choose board artwork
      </button>
    </div>
    <p
      v-if="error"
      role="alert"
      class="mt-3 text-red-500"
    >
      {{ error }}
    </p>
  </dialog>
  <dialog
    ref="deleteDialog"
    aria-label="Delete library composition"
    class="m-auto w-md max-w-[calc(100%-2rem)] space-y-4 rounded-xl bg-surface p-5 text-ink backdrop:bg-black/50"
    @close="deleting = undefined"
  >
    <template v-if="deleting">
      <h2 class="font-semibold">Delete {{ deleting.name }}?</h2>
      <p>
        Placed snapshots remain in your projects. They can still render, export and detach, but will
        no longer receive library updates.
      </p>
      <button
        class="rounded bg-soft p-2"
        @click="deleting = undefined"
      >
        Cancel deletion
      </button>
      <button
        class="rounded bg-accent p-2 text-white"
        :disabled="busy"
        @click="confirmDelete"
      >
        Delete composition
      </button>
    </template>
  </dialog>
  <dialog
    ref="updateDialog"
    aria-label="Preview library update"
    class="m-auto w-2xl max-w-[calc(100%-2rem)] space-y-4 rounded-xl bg-surface p-5 text-ink backdrop:bg-black/50"
    @close="pending = undefined"
  >
    <template v-if="pending">
      <h2 class="text-lg font-semibold">Preview update: {{ pending.name }}</h2>
      <label>
        Board side
        <select
          v-model="previewSide"
          aria-label="Update preview side"
          class="ml-2 rounded bg-soft p-2"
          @change="renderPreview"
        >
          <option value="front">Front</option>
          <option value="back">Back</option>
        </select>
      </label>
      <div class="grid grid-cols-2 gap-4">
        <figure>
          <img
            :src="imageUrl(before)"
            class="h-40 w-full bg-soft object-contain"
            alt="Current library revision"
          />
          <figcaption>Current revision</figcaption>
        </figure>
        <figure>
          <img
            :src="imageUrl(after)"
            class="h-40 w-full bg-soft object-contain"
            alt="Latest library revision"
          />
          <figcaption>Latest revision</figcaption>
        </figure>
      </div>
      <p>Both sides update together. Position, rotation and scale are preserved.</p>
      <div class="flex gap-2">
        <button
          class="rounded bg-accent p-2 text-white"
          :disabled="busy"
          @click="applyUpdate"
        >
          Apply update
        </button>
        <button
          class="rounded bg-soft p-2"
          @click="pending = undefined"
        >
          Cancel update
        </button>
      </div>
    </template>
  </dialog>
</template>
