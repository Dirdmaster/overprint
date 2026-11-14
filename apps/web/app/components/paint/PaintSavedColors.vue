<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { Check, Plus, Ellipsis, Pencil, Trash2, X } from '@lucide/vue'
import { useArtworkPalette } from '../../composables/artwork/useArtworkPalette'
import { useLivePaint } from '../../composables/artwork/useLivePaint'
const { palette, setPalette } = useArtworkPalette()
const { color, picking, feedback } = useLivePaint()
const root = useTemplateRef('root'),
  panel = useTemplateRef('panel'),
  nameInput = useTemplateRef('nameInput')
const mode = ref<'save' | 'manage'>('save'),
  name = ref(''),
  error = ref(''),
  editing = ref<number>(),
  rename = ref('')
const position = ref({ left: '0px', top: '0px' })
let anchor: HTMLButtonElement | undefined
const existing = computed(() =>
  palette.value.find((entry) => entry.color.toLowerCase() === color.value.toLowerCase())
)
const choose = (value: string) => {
  color.value = value
  picking.value = false
  feedback.value = ''
}
const focusBack = () =>
  nextTick(() => {
    if (anchor?.isConnected && !anchor.disabled) anchor.focus()
    else root.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
  })
const close = () => {
  panel.value?.hidePopover()
  editing.value = undefined
  focusBack()
}
const show = async (value: 'save' | 'manage', event: MouseEvent) => {
  anchor = event.currentTarget as HTMLButtonElement
  anchor.focus()
  mode.value = value
  name.value = ''
  error.value = ''
  editing.value = undefined
  panel.value?.showPopover()
  await nextTick()
  const box = anchor.getBoundingClientRect(),
    bounds = panel.value!.getBoundingClientRect()
  position.value = {
    left: `${Math.max(8, Math.min(box.right - bounds.width, window.innerWidth - bounds.width - 8))}px`,
    top: `${Math.max(8, box.bottom + 8 + bounds.height > window.innerHeight - 8 ? box.top - bounds.height - 8 : box.bottom + 8)}px`
  }
  if (value === 'save') nameInput.value?.focus()
  else panel.value?.querySelector<HTMLButtonElement>('[data-saved-color]')?.focus()
}
const save = () => {
  const label = name.value.trim()
  if (!label || existing.value) return
  try {
    setPalette([...palette.value, { name: label, color: color.value }])
    close()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not save this color.'
  }
}
const startRename = async (index: number) => {
  editing.value = index
  rename.value = palette.value[index]!.name
  await nextTick()
  panel.value?.querySelector<HTMLInputElement>('[data-rename-color]')?.select()
}
const applyRename = (index: number) => {
  if (!rename.value.trim()) return
  try {
    setPalette(
      palette.value.map((entry, i) =>
        i === index ? { ...entry, name: rename.value.trim() } : entry
      )
    )
    editing.value = undefined
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not rename this color.'
  }
}
const remove = (index: number) => {
  try {
    setPalette(palette.value.filter((_, i) => i !== index))
    editing.value = undefined
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not remove this color.'
  }
}
const cancel = (event: KeyboardEvent) => {
  event.preventDefault()
  event.stopPropagation()
  if (editing.value !== undefined) editing.value = undefined
  else close()
}
</script>
<template>
  <section
    ref="root"
    class="space-y-2"
    aria-label="Saved paint colors"
  >
    <header class="flex items-center justify-between gap-2">
      <h3 class="font-medium text-muted">Saved colors</h3>
      <div class="flex items-center gap-1">
        <button
          class="flex size-6 items-center justify-center rounded text-muted hover:bg-soft disabled:opacity-30"
          aria-label="Save current paint color"
          :title="existing ? `Already saved as ${existing.name}` : 'Save current color'"
          :disabled="!!existing || palette.length >= 32"
          @click="show('save', $event)"
        >
          <Plus :size="14" />
        </button>
        <button
          class="flex size-6 items-center justify-center rounded text-muted hover:bg-soft"
          aria-label="Manage saved colors"
          title="Manage saved colors"
          @click="show('manage', $event)"
        >
          <Ellipsis :size="16" />
        </button>
      </div>
    </header>
    <div
      v-if="palette.length"
      class="grid grid-cols-8 gap-1.5"
      role="group"
      aria-label="Saved color swatches"
    >
      <button
        v-for="(entry, index) in palette"
        :key="index"
        class="flex aspect-square items-center justify-center rounded-md border border-black/15 ring-offset-2 ring-offset-surface hover:ring-1 hover:ring-muted"
        :style="{ backgroundColor: entry.color }"
        :title="`${entry.name} · ${entry.color}`"
        :aria-label="`Paint ${entry.name}`"
        :aria-pressed="color.toLowerCase() === entry.color.toLowerCase()"
        @click="choose(entry.color)"
      >
        <Check
          v-if="color.toLowerCase() === entry.color.toLowerCase()"
          class="size-4 rounded-full bg-black/60 p-0.5 text-white"
        />
      </button>
    </div>
    <p
      v-else
      class="text-xs leading-relaxed text-muted"
    >
      Save the current color with + to reuse it here.
    </p>
  </section>
  <div
    ref="panel"
    popover="auto"
    role="dialog"
    :aria-label="mode === 'save' ? 'Save paint color' : 'Manage saved colors'"
    class="fixed m-0 w-72 max-w-[calc(100%-1rem)] space-y-3 rounded-xl border border-line bg-surface p-3 text-xs text-ink shadow-xl"
    :style="position"
    @keydown.esc="cancel"
  >
    <header class="flex items-center justify-between">
      <h3 class="font-medium">{{ mode === 'save' ? 'Save color' : 'Saved colors' }}</h3>
      <button
        class="flex size-6 items-center justify-center rounded text-muted hover:bg-soft"
        aria-label="Close saved colors"
        @click="close"
      >
        <X :size="16" />
      </button>
    </header>
    <form
      v-if="mode === 'save'"
      class="space-y-3"
      @submit.prevent="save"
    >
      <div class="flex items-center gap-3">
        <span
          class="size-9 rounded-lg border border-line"
          :style="{ backgroundColor: color }"
        />
        <span class="text-muted">{{ color.toUpperCase() }}</span>
      </div>
      <input
        ref="nameInput"
        v-model="name"
        aria-label="Saved color name"
        maxlength="80"
        placeholder="Name this color"
        class="w-full rounded-md border border-line bg-soft px-3 py-2 text-sm"
      />
      <button
        class="primary-button min-h-9 w-full disabled:opacity-40"
        type="submit"
        :disabled="!name.trim() || !!existing"
      >
        Save color
      </button>
    </form>
    <div
      v-else
      class="max-h-64 space-y-1 overflow-y-auto"
    >
      <p
        v-if="!palette.length"
        class="py-3 text-muted"
      >
        No saved colors yet. Use + in Paint to save the current color.
      </p>
      <div
        v-for="(entry, index) in palette"
        :key="index"
        class="group flex items-center gap-2 rounded-md p-1 hover:bg-soft"
      >
        <button
          data-saved-color
          class="size-7 shrink-0 rounded-md border border-black/15"
          :style="{ backgroundColor: entry.color }"
          :aria-label="`Use saved color ${entry.name}`"
          :title="entry.color"
          @click="choose(entry.color)"
        />
        <form
          v-if="editing === index"
          class="flex min-w-0 flex-1 items-center gap-1"
          @submit.prevent="applyRename(index)"
        >
          <input
            v-model="rename"
            data-rename-color
            aria-label="Saved color name"
            maxlength="80"
            class="min-w-0 w-full rounded border border-line bg-surface p-1"
          />
          <button
            class="p-1"
            aria-label="Confirm color name"
            type="submit"
          >
            <Check :size="14" />
          </button>
        </form>
        <template v-else>
          <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
          <button
            class="p-1 text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            :aria-label="`Rename saved color ${entry.name}`"
            @click="startRename(index)"
          >
            <Pencil :size="13" />
          </button>
          <button
            class="p-1 text-muted opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            :aria-label="`Delete saved color ${entry.name}`"
            @click="remove(index)"
          >
            <Trash2 :size="13" />
          </button>
        </template>
      </div>
    </div>
    <p
      v-if="error"
      role="alert"
      class="text-red-500"
    >
      {{ error }}
    </p>
  </div>
</template>
