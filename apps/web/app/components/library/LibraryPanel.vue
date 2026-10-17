<script setup lang="ts">
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
const previews = ref<Record<string, string>>({}),
  pending = ref<LibraryAsset>()
const deleting = ref<LibraryAsset>()
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
const graphics = computed(() => items.value.filter((item) => !item.nativeSilk))
const thumbnails = async () => {
  for (const asset of assets.value) {
    const snapshot = asset.revisions.at(-1)!.snapshot
    previews.value[asset.id] = await snapshotSvg(
      snapshot,
      snapshot.artwork.some((item) => item.side === 'front' && !item.kind) ? 'front' : 'back'
    )
  }
}
const show = async () => {
  libraryDialog.value?.showModal()
  captureIds.value = [...selectionIds.value]
  await refresh()
  await thumbnails()
}
const saveSelection = async (asset?: LibraryAsset) => {
  await save(asset?.name ?? name.value, captureIds.value, asset)
  await thumbnails()
}
const preview = async () => {
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
const imageUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
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
    class="m-auto max-h-[85svh] w-3xl max-w-[calc(100%-2rem)] overflow-auto rounded-xl bg-surface p-5 text-ink shadow-xl backdrop:bg-black/50"
  >
    <header class="flex items-center justify-between gap-4">
      <h2 class="text-lg font-semibold">Composition library</h2>
      <button
        class="rounded bg-soft p-2"
        aria-label="Close library"
        @click="libraryDialog?.close()"
      >
        Close
      </button>
    </header>
    <p class="my-3 text-sm text-muted">
      Saved on this device. Linked placements stay pinned until you preview and apply an update.
    </p>
    <div class="grid gap-4 sm:grid-cols-2">
      <section class="space-y-3 rounded-lg border border-line p-3">
        <label class="block">
          Composition name
          <input
            v-model="name"
            aria-label="Composition name"
            maxlength="200"
            class="mt-1 w-full rounded bg-soft p-2"
          />
        </label>
        <fieldset class="max-h-48 space-y-1 overflow-auto">
          <legend class="mb-2 font-medium">Capture artwork from either side</legend>
          <label
            v-for="item in graphics"
            :key="item.id"
            class="flex items-center gap-2"
          >
            <input
              v-model="captureIds"
              type="checkbox"
              :value="item.id"
              :aria-label="`Capture ${item.name} ${item.side}`"
            />
            {{ item.name }} · {{ item.side }}
          </label>
        </fieldset>
        <button
          class="rounded bg-accent px-3 py-2 text-white disabled:opacity-40"
          :disabled="busy || !captureIds.length"
          @click="saveSelection()"
        >
          Save selection
        </button>
      </section>
      <section class="space-y-3">
        <label class="block">
          Search library
          <input
            v-model="search"
            aria-label="Search library"
            class="mt-1 w-full rounded bg-soft p-2"
          />
        </label>
        <article
          v-for="asset in filtered"
          :key="asset.id"
          class="space-y-2 rounded-lg border border-line p-3"
        >
          <img
            v-if="previews[asset.id]"
            :src="imageUrl(previews[asset.id]!)"
            :alt="`${asset.name} thumbnail`"
            class="h-20 w-full rounded bg-soft object-contain"
          />
          <h3 class="font-semibold">{{ asset.name }}</h3>
          <p class="text-muted">
            {{ asset.revisions.length }} revision{{ asset.revisions.length === 1 ? '' : 's' }}
          </p>
          <label class="block">
            Rename
            <input
              :value="asset.name"
              :aria-label="`Rename ${asset.name}`"
              maxlength="200"
              class="mt-1 w-full rounded bg-soft p-2"
              @change="rename(asset, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <div class="flex flex-wrap gap-2">
            <button
              class="rounded bg-soft p-2"
              :disabled="busy"
              :aria-label="`Place linked ${asset.name}`"
              @click="place(asset, true)"
            >
              Place linked
            </button>
            <button
              class="rounded bg-soft p-2"
              :disabled="busy"
              :aria-label="`Place copy ${asset.name}`"
              @click="place(asset, false)"
            >
              Place copy
            </button>
            <button
              class="rounded bg-soft p-2"
              :disabled="busy"
              :aria-label="`Delete library ${asset.name}`"
              @click="deleting = asset"
            >
              Delete
            </button>
            <button
              class="rounded bg-soft p-2"
              :disabled="busy || !captureIds.length"
              :aria-label="`Save new revision of ${asset.name}`"
              @click="saveSelection(asset)"
            >
              Save new revision
            </button>
          </div>
        </article>
        <p
          v-if="!filtered.length"
          class="text-muted"
        >
          No saved compositions.
        </p>
      </section>
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
