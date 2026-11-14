<script setup lang="ts">
import { useLayerDrag } from '../../composables/artwork/useLayerDrag'
import { useComposition } from '../../composables/project/useComposition'
import { useArtwork } from '../../composables/artwork/useArtwork'
import ArtworkTextProperties from './ArtworkTextProperties.vue'
import VectorInspector from './VectorInspector.vue'
import DrawingInspector from './DrawingInspector.vue'
import TextInspector from './TextInspector.vue'
import EditorHistory from '../editor/EditorHistory.vue'
import ArtworkAlignment from './ArtworkAlignment.vue'
import { computed, ref, watch } from 'vue'
import {
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  Trash2,
  ArrowUp,
  ArrowDown,
  Folder,
  Layers,
  ChevronDown,
  ChevronRight
} from '@lucide/vue'
import { artworkRows, readArtwork } from '../../utils/artwork'
import type { AlignmentBounds } from '../../utils/artworkAlignment'
const props = withDefaults(
  defineProps<{
    side: string
    bounds: AlignmentBounds
    showRows?: boolean
    showProperties?: boolean
    showHistory?: boolean
  }>(),
  { showRows: true, showProperties: true, showHistory: true }
)
const { side: activeSide } = useComposition()
const {
  items,
  selection,
  selectionIds,
  selectedArtwork,
  select,
  edit,
  remove,
  reorder,
  reparent,
  descendants,
  protectedSubtree,
  moveToSide,
  canMoveToSide
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
const replaceableGraphic = computed(() =>
  current.value &&
  !current.value.kind &&
  !current.value.drawing &&
  !current.value.text &&
  !current.value.library &&
  !current.value.gold
    ? current.value
    : undefined
)
const replacementPicker = ref<HTMLInputElement | null>(null)
const replacementError = ref('')
const replaceGraphic = async (event: Event) => {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0],
    target = replaceableGraphic.value
  if (!file || !target) return
  try {
    const next = await readArtwork(file)
    if (!items.value.includes(target) || selection.value !== target.id)
      throw new Error('The selected artwork changed. Select it and try again.')
    const width = Math.min(target.width, target.height * next.ratio),
      height = width / next.ratio
    edit(target.id, {
      source: next.source,
      x: target.x + (target.width - width) / 2,
      y: target.y + (target.height - height) / 2,
      width,
      height
    })
    replacementError.value = ''
  } catch (cause) {
    replacementError.value = cause instanceof Error ? cause.message : 'Unable to replace graphic.'
  } finally {
    input.value = ''
  }
}
const rowLabel = (item: (typeof items.value)[number], label: string) =>
  props.side !== activeSide.value &&
  items.value.some((other) => other.side !== props.side && other.name === item.name)
    ? `${props.side === 'front' ? 'Front' : 'Back'}: ${label}`
    : label
const chooseLayer = (id: string, additive: boolean) => {
  activeSide.value = props.side
  select(id, additive)
}
const moveSelection = (event: Event) => {
  if (!current.value) return
  const value = (event.target as HTMLSelectElement).value
  if (value.startsWith('artboard:')) {
    const side = value.slice(9),
      id = current.value.id
    if (moveToSide(id, side)) {
      activeSide.value = side
      selection.value = id
    }
  } else reparent(current.value.id, value || undefined)
}
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
  <div class="relative px-3 pt-3">
    <template v-if="showRows">
      <p
        v-if="!layers.length"
        class="px-1 py-3 text-muted"
      >
        {{ side === activeSide ? 'No artwork yet' : 'Empty artboard' }}
      </p>
      <div
        v-for="{ item, depth, locked, inheritedLock } in rows"
        :key="item.id"
        :data-layer-row="item.id"
        class="group relative flex items-center gap-2 rounded-md p-1"
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
          :aria-label="rowLabel(item, `Toggle ${item.name}`)"
          :aria-pressed="item.visible"
          @click="edit(item.id, { visible: !item.visible })"
        >
          <component
            :is="item.visible ? Eye : EyeOff"
            class="size-4"
          />
        </button>
        <button
          :aria-label="
            rowLabel(
              item,
              inheritedLock
                ? `${item.name} locked by parent`
                : `${item.locked ? 'Unlock' : 'Lock'} ${item.name}`
            )
          "
          :aria-pressed="locked"
          :disabled="inheritedLock"
          class="rounded p-1 text-muted disabled:opacity-50"
          @click="edit(item.id, { locked: !item.locked })"
        >
          <component
            :is="locked ? LockKeyhole : LockKeyholeOpen"
            class="size-4"
          />
        </button>
        <button
          v-if="item.kind"
          class="text-muted"
          :aria-label="rowLabel(item, `${item.collapsed ? 'Expand' : 'Collapse'} ${item.name}`)"
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
          class="min-w-0 flex-1 truncate py-1 text-left"
          :aria-label="rowLabel(item, item.name)"
          :draggable="!protectedSubtree(item.id)"
          :disabled="locked"
          title="Drag to reorder or move into a folder"
          :aria-pressed="selectionIds.includes(item.id)"
          @dragstart="start($event, item)"
          @dragend="clear"
          @click="chooseLayer(item.id, $event.shiftKey)"
        >
          {{ item.name }}
        </button>
        <button
          class="p-1 text-muted"
          :class="
            selectionIds.includes(item.id)
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          "
          :aria-label="rowLabel(item, `Delete ${item.name}`)"
          :disabled="protectedSubtree(item.id)"
          @click="remove(item.id)"
        >
          <Trash2 class="size-4" />
        </button>
      </div>
      <div
        v-if="dragging && items.find((item) => item.id === dragging)?.side === side"
        class="absolute inset-x-3 top-full z-20 mt-1 rounded-md border border-dashed border-line bg-surface px-3 py-2 text-center text-xs text-muted"
        :class="dropTarget?.id === null ? 'bg-soft ring-2 ring-inset ring-accent' : ''"
        data-layer-root-drop
        @dragenter="over($event)"
        @dragover="over($event)"
        @drop="drop"
        @dragleave="leave"
      >
        Move to {{ side === 'front' ? 'Front' : 'Back' }} artboard
      </div>
    </template>
    <template v-if="showProperties">
      <div class="mt-2 flex gap-2 text-muted">
        <EditorHistory v-if="showHistory" />
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
            @change="moveSelection"
          >
            <option value="">{{ side === 'front' ? 'Front' : 'Back' }} artboard</option>
            <option
              :value="`artboard:${side === 'front' ? 'back' : 'front'}`"
              :disabled="!canMoveToSide(current.id, side === 'front' ? 'back' : 'front')"
            >
              {{ side === 'front' ? 'Back' : 'Front' }} artboard
            </option>
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
      <div
        v-if="replaceableGraphic"
        class="mt-3"
      >
        <button
          class="rounded bg-soft px-3 py-2"
          @click="replacementPicker?.click()"
        >
          Replace SVG
        </button>
        <input
          ref="replacementPicker"
          type="file"
          accept=".svg,image/svg+xml"
          aria-label="Choose replacement SVG"
          class="hidden"
          @change="replaceGraphic"
        />
        <p
          v-if="replacementError"
          role="alert"
        >
          {{ replacementError }}
        </p>
      </div>
      <p
        v-else-if="current?.library"
        class="mt-3 text-xs text-muted"
      >
        This graphic is linked to a library composition. Update the library or detach this instance
        before replacing its SVG.
      </p>
      <ArtworkTextProperties
        v-if="current?.text"
        :key="current.id"
        :item="current"
      />
      <DrawingInspector
        v-if="current?.drawing?.type === 'shape'"
        :key="current.id"
        :item="current"
      />
      <TextInspector
        v-if="current?.drawing?.type === 'text'"
        :key="current.id"
        :item="current"
      />
      <VectorInspector
        v-if="
          selectedArtwork.filter((item) => item.side === side).length > 1 ||
          (current &&
            !current.kind &&
            !current.drawing &&
            !current.text &&
            !current.appearance &&
            !current.library &&
            !current.gold)
        "
        :item="current"
      />
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
    </template>
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
