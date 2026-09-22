<script setup lang="ts">
import { useLayerDrag } from '../../composables/artwork/useLayerDrag'
import { useArtwork } from '../../composables/artwork/useArtwork'
import ArtworkAlignment from './ArtworkAlignment.vue'
import { computed, watch } from 'vue'
import {
  Eye,
  EyeOff,
  Trash2,
  ArrowUp,
  ArrowDown,
  Undo2,
  Redo2,
  Folder,
  Layers,
  ChevronDown,
  ChevronRight
} from '@lucide/vue'
import { artworkRows } from '~/utils/artwork'
import type { AlignmentBounds } from '~/utils/artworkAlignment'
const props = defineProps<{ side: string; bounds: AlignmentBounds }>()
const {
  items,
  selection,
  selectionIds,
  select,
  past,
  future,
  edit,
  remove,
  reorder,
  undo,
  redo,
  reparent,
  descendants
} = useArtwork()
const { dragging, dropTarget, start, over, drop, clear, leave } = useLayerDrag()
watch(() => props.side, clear)
const rows = computed(() => {
  const reversed = [...items.value].reverse()
  return artworkRows(reversed, props.side)
})
const layers = computed(() =>
  items.value.filter((item) => !item.nativeSilk && item.side === props.side)
)
const current = computed(() =>
  selectionIds.value.length === 1
    ? layers.value.find((item) => item.id === selection.value)
    : undefined
)
const destinations = computed(() =>
  layers.value.filter(
    (item) =>
      item.kind &&
      item.id !== current.value?.id &&
      !descendants(current.value?.id ?? '').includes(item.id)
  )
)
const numeric = (key: 'x' | 'y' | 'width' | 'height' | 'rotation', event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  const item = current.value
  if (
    !item ||
    !Number.isFinite(value) ||
    Math.abs(value) > 10000 ||
    (['width', 'height'].includes(key) && value <= 0)
  )
    return
  const patch = { [key]: value }
  if (key === 'width') patch.height = (value * item.height) / item.width
  if (key === 'height') patch.width = (value * item.width) / item.height
  edit(item.id, patch)
}
</script>
<template>
  <div class="px-3 pt-3">
    <p
      v-if="!layers.length"
      class="px-1 py-3 text-muted"
    >
      No artwork yet
    </p>
    <div
      v-for="{ item, depth } in rows"
      :key="item.id"
      :data-layer-row="item.id"
      class="relative flex items-center gap-2 rounded-md p-1"
      :style="{ paddingLeft: `${depth * 12 + 4}px` }"
      :class="[
        selectionIds.includes(item.id) ? 'bg-soft' : '',
        dragging === item.id ? 'opacity-40' : '',
        dropTarget?.id === item.id && dropTarget.position === 'inside'
          ? 'bg-soft ring-2 ring-inset ring-accent'
          : ''
      ]"
      @dragenter="over($event, item)"
      @dragover="over($event, item)"
      @drop="drop"
      @dragleave="leave"
    >
      <span
        v-if="dropTarget?.id === item.id && dropTarget.position !== 'inside'"
        class="pointer-events-none absolute right-0 z-10 h-0.5 rounded bg-accent"
        :class="dropTarget.position === 'before' ? 'top-0' : 'bottom-0'"
        :style="{ left: `${depth * 12 + 4}px` }"
      />
      <button
        class="p-1 text-muted"
        :aria-label="`Toggle ${item.name}`"
        :aria-pressed="item.visible"
        @click="edit(item.id, { visible: !item.visible })"
      >
        <component
          :is="item.visible ? Eye : EyeOff"
          class="size-4"
        />
      </button>
      <button
        v-if="item.kind"
        class="text-muted"
        :aria-label="`${item.collapsed ? 'Expand' : 'Collapse'} ${item.name}`"
        @click="edit(item.id, { collapsed: !item.collapsed })"
      >
        <component
          :is="item.collapsed ? ChevronRight : ChevronDown"
          class="size-3"
        />
      </button>
      <component
        v-if="item.kind"
        :is="item.kind === 'folder' ? Folder : Layers"
        class="size-4 shrink-0 text-muted"
      />
      <button
        class="min-w-0 flex-1 truncate py-2 text-left"
        draggable="true"
        title="Drag to reorder or move into a folder"
        :aria-pressed="selectionIds.includes(item.id)"
        @dragstart="start($event, item)"
        @dragend="clear"
        @click="select(item.id, $event.shiftKey)"
      >
        {{ item.name }}
      </button>
      <button
        class="p-1 text-muted"
        :aria-label="`Delete ${item.name}`"
        @click="remove(item.id)"
      >
        <Trash2 class="size-4" />
      </button>
    </div>
    <div
      v-if="dragging"
      class="mt-1 rounded-md border border-dashed border-line px-3 py-2 text-center text-xs text-muted"
      :class="dropTarget?.id === null ? 'bg-soft ring-2 ring-inset ring-accent' : ''"
      data-layer-root-drop
      @dragenter="over($event)"
      @dragover="over($event)"
      @drop="drop"
      @dragleave="leave"
    >
      Move to board root
    </div>
    <div class="mt-2 flex gap-2 text-muted">
      <button
        :disabled="!past.length"
        class="rounded p-1 disabled:opacity-30"
        aria-label="Undo"
        @click="undo"
      >
        <Undo2 class="size-4" />
      </button>
      <button
        :disabled="!future.length"
        class="rounded p-1 disabled:opacity-30"
        aria-label="Redo"
        @click="redo"
      >
        <Redo2 class="size-4" />
      </button>
      <template v-if="current">
        <button
          class="rounded p-1"
          aria-label="Bring forward"
          @click="reorder(current.id, 1)"
        >
          <ArrowUp class="size-4" />
        </button>
        <button
          class="rounded p-1"
          aria-label="Send backward"
          @click="reorder(current.id, -1)"
        >
          <ArrowDown class="size-4" />
        </button>
      </template>
    </div>
    <div
      v-if="current"
      class="mt-3 space-y-2"
    >
      <label class="flex flex-col gap-1 text-muted">
        Name
        <input
          aria-label="Layer name"
          :value="current.name"
          maxlength="200"
          class="rounded bg-soft p-2 text-ink"
          @change="
            edit(current.id, {
              name: ($event.target as HTMLInputElement).value.trim() || current.name
            })
          "
        />
      </label>
      <label class="flex flex-col gap-1 text-muted">
        Move to
        <select
          aria-label="Move to"
          :value="current.parentId ?? ''"
          class="rounded bg-soft p-2 text-ink"
          @change="reparent(current.id, ($event.target as HTMLSelectElement).value || undefined)"
        >
          <option value="">Board root</option>
          <option
            v-for="parent in destinations"
            :key="parent.id"
            :value="parent.id"
          >
            {{ parent.name }}
          </option>
        </select>
      </label>
    </div>
    <ArtworkAlignment
      :bounds="bounds"
      :side="side"
    />
    <fieldset
      v-if="current && !current.kind"
      class="mt-3 grid grid-cols-2 gap-2"
    >
      <legend class="mb-2 font-medium">Transform</legend>
      <label
        v-for="key in ['x', 'y', 'width', 'height', 'rotation'] as const"
        :key="key"
        class="flex flex-col gap-1 text-muted"
      >
        {{ key === 'rotation' ? 'Rotation (°)' : `${key.toUpperCase()} (mm)` }}
        <input
          type="number"
          step="0.1"
          :aria-label="`Artwork ${key}`"
          :value="Number(current[key].toFixed(3))"
          class="w-full rounded bg-soft p-2 text-ink"
          @change="numeric(key, $event)"
        />
      </label>
    </fieldset>
  </div>
</template>

<style scoped>
button[draggable] {
  cursor: grab;
}
button[draggable]:active {
  cursor: grabbing;
}
</style>
