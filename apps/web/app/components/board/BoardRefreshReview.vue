<script setup lang="ts">
import { svgImageAttributes } from '../../utils/svgImage'
import { ref, watch, nextTick, onMounted } from 'vue'
import { useBoardRefresh } from '../../composables/project/useBoardRefresh'
import { importBoardFile } from '../../utils/importBoardFile'
import ImportWorker from '../../workers/kicadImport?worker&inline'
const r = useBoardRefresh(),
  dialog = ref<HTMLDialogElement>(),
  picker = ref<HTMLInputElement>(),
  selectedSide = ref('front'),
  loading = ref(false)
watch(
  () => r.pending.value,
  async (next) => {
    await nextTick()
    if (next) dialog.value?.showModal()
    else dialog.value?.close()
  }
)
onMounted(r.refreshRevisions)
const read = async (event: Event) => {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file || loading.value) return
  loading.value = true
  try {
    r.stage(await importBoardFile(file, undefined, () => new ImportWorker()))
  } catch (e) {
    r.error.value = e instanceof Error ? e.message : 'Could not read PCB update.'
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <section
    class="p-4"
    aria-label="PCB updates"
  >
    <h2 class="font-medium">Update PCB</h2>
    <div class="mt-3 space-y-2">
      <button
        class="rounded bg-soft p-2"
        :disabled="loading"
        @click="picker?.click()"
      >
        {{ loading ? 'Reading PCB…' : 'Review PCB file update' }}
      </button>
      <input
        ref="picker"
        type="file"
        accept=".overprint-board,.kicad_pcb"
        aria-label="Choose PCB update"
        class="hidden"
        @change="read"
      />
      <p class="text-muted">
        Compare geometry before applying a refresh. Recovery copies are also available in Projects
        and workspace backups.
      </p>
      <h3
        v-if="r.revisions.value.length"
        class="pt-2 font-medium"
      >
        Saved PCB revisions
      </h3>
      <button
        v-for="revision in r.revisions.value"
        :key="revision.id"
        class="block w-full rounded bg-soft p-2 text-left"
        :disabled="r.busy.value"
        @click="r.restore(revision.id)"
      >
        Restore {{ revision.name }} · {{ new Date(revision.updatedAt).toLocaleString() }}
      </button>
      <p
        v-if="r.error.value"
        role="alert"
      >
        {{ r.error.value }}
      </p>
    </div>
  </section>
  <dialog
    ref="dialog"
    aria-label="Review PCB update"
    class="m-auto max-h-[90svh] w-4xl max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink"
    @cancel.prevent="!r.busy.value && (r.pending.value = undefined)"
  >
    <template v-if="r.pending.value">
      <h2 class="text-lg font-semibold">Review PCB update</h2>
      <p class="mt-2 text-sm">
        Your artwork stays in place. A recoverable project revision is saved before applying.
      </p>
      <p class="mt-3 text-sm">
        Outline: {{ r.pending.value.comparison.outlineChanged ? 'changed' : 'unchanged' }} · Bounds:
        {{ r.pending.value.comparison.boundsChanged ? 'changed' : 'unchanged' }} · Moved
        pads/components: {{ r.pending.value.comparison.moved.length }}
      </p>
      <p class="text-sm">
        Pad regions added/removed: front {{ r.pending.value.comparison.front.added }}/{{
          r.pending.value.comparison.front.removed
        }}, back {{ r.pending.value.comparison.back.added }}/{{
          r.pending.value.comparison.back.removed
        }}.
      </p>
      <div class="mt-3 flex gap-2">
        <button
          v-for="side in ['front', 'back']"
          :key="side"
          class="rounded bg-soft p-2"
          :aria-pressed="selectedSide === side"
          @click="selectedSide = side"
        >
          {{ side === 'front' ? 'Front' : 'Back' }}
        </button>
      </div>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <figure
          v-for="(board, index) in [r.pending.value.before.board, r.pending.value.next]"
          :key="index"
        >
          <figcaption class="mb-2 font-medium">
            {{ index ? 'After refresh' : 'Current PCB' }}
          </figcaption>
          <svg
            class="h-60 w-full rounded bg-soft"
            :viewBox="`${board.bounds.x - 2} ${board.bounds.y - 2} ${board.bounds.width + 4} ${board.bounds.height + 4}`"
            :aria-label="index ? 'PCB after refresh' : 'PCB before refresh'"
            role="img"
          >
            <g
              :transform="
                selectedSide === 'back'
                  ? `translate(${2 * board.bounds.x + board.bounds.width} 0) scale(-1 1)`
                  : undefined
              "
            >
              <path
                :d="board.outline"
                :fill="r.pending.value.before.mask"
              />
              <g
                v-for="item in r.pending.value.before.artwork.filter(
                  (i) => i.side === selectedSide && i.visible && !i.kind
                )"
                :key="item.id"
                :transform="`rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})`"
              >
                <image v-bind="svgImageAttributes(item, selectedSide)" />
              </g>
              <path
                v-for="(mask, n) in board.layers[`${selectedSide}-mask`]"
                :key="n"
                :d="mask"
                fill="#cfac61"
              />
              <path
                :d="board.outline"
                fill="none"
                :stroke="index ? '#39a96b' : '#e63136'"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
              />
            </g>
          </svg>
        </figure>
      </div>
      <details class="mt-3">
        <summary>
          {{ r.pending.value.comparison.reviewArtwork.length }} artwork placements to review
        </summary>
        <ul>
          <li
            v-for="i in r.pending.value.comparison.reviewArtwork"
            :key="i.id"
          >
            {{ i.side }}: {{ i.name }}
          </li>
        </ul>
      </details>
      <p
        v-if="r.error.value"
        role="alert"
        class="mt-3"
      >
        {{ r.error.value }}
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          class="header-action"
          :disabled="r.busy.value"
          @click="r.pending.value = undefined"
        >
          Cancel update
        </button>
        <button
          class="primary-button"
          :disabled="r.busy.value"
          @click="r.apply()"
        >
          {{ r.busy.value ? 'Saving revision…' : 'Save revision and apply' }}
        </button>
      </div>
    </template>
  </dialog>
</template>
