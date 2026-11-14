<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { PopoverRoot, PopoverAnchor, PopoverTrigger, PopoverContent } from 'reka-ui'
import {
  Hand,
  MousePointer2,
  MousePointer,
  PaintBucket,
  Type,
  Square,
  Circle,
  Minus,
  RectangleHorizontal,
  PenTool
} from '@lucide/vue'
import { useCanvasToolState } from '../../composables/canvas/useCanvasToolState'
import { useEditorRef } from '../../composables/editor/editorState'
import type { CanvasToolDefinition } from '../../utils/canvasTools'
const props = defineProps<{
  id: string
  label: string
  tools: CanvasToolDefinition[]
  orientation: 'horizontal' | 'vertical'
  showShortcuts: boolean
}>()
const { selected, active } = useCanvasToolState()
const last = useEditorRef(`tool-group-${props.id}`, () => props.tools[0]!.id)
const current = computed(
  () =>
    props.tools.find((tool) => tool.id === active.value) ??
    props.tools.find((tool) => tool.id === last.value) ??
    props.tools[0]!
)
const displayName = (label: string) =>
  label
    .replace(/ \(.+\)$/, '')
    .replace(/^Draw /, '')
    .replace(/^./, (character) => character.toUpperCase())
const toolTitle = computed(
  () =>
    `${displayName(current.value.label)}${current.value.shortcut ? ` (${current.value.shortcut})` : ''}${current.value.id === 'hand' ? ' · Hold Space to pan' : ''}${props.tools.length > 1 ? ' · Hold for tools; Option-click cycles' : ''}`
)
const open = ref(false)
const icons = {
  select: MousePointer2,
  directSelect: MousePointer,
  hand: Hand,
  paint: PaintBucket,
  text: Type,
  rectangle: Square,
  roundedRectangle: RectangleHorizontal,
  ellipse: Circle,
  line: Minus,
  pen: PenTool
}
watch(selected, (tool) => {
  if (props.tools.some((item) => item.id === tool)) last.value = tool
  open.value = false
})
let timer: ReturnType<typeof setTimeout> | undefined
let held = false
const cancelHold = () => {
  clearTimeout(timer)
  timer = undefined
}
const startHold = (event: PointerEvent) => {
  cancelHold()
  held = false
  if (event.button !== 0 || event.altKey || props.tools.length < 2) return
  timer = setTimeout(() => {
    held = true
    open.value = true
  }, 350)
}
const choose = (tool = current.value.id) => {
  selected.value = tool
  open.value = false
}
const activate = (event: MouseEvent) => {
  cancelHold()
  if (!held) {
    const index = props.tools.findIndex((tool) => tool.id === current.value.id)
    choose(event.altKey ? props.tools[(index + 1) % props.tools.length]!.id : current.value.id)
  }
  held = false
}
const reveal = () => {
  if (props.tools.length > 1) {
    cancelHold()
    open.value = true
  }
}
onBeforeUnmount(cancelHold)
</script>
<template>
  <PopoverRoot v-model:open="open">
    <PopoverAnchor as-child>
      <div
        role="group"
        :aria-label="label"
        class="relative size-10 shrink-0"
        @contextmenu.prevent="reveal"
      >
        <button
          part="tool-button"
          :aria-label="current.label"
          :title="toolTitle"
          :aria-pressed="tools.some((tool) => tool.id === active)"
          class="grid size-10 place-items-center rounded-md"
          :class="[
            tools.some((tool) => tool.id === active)
              ? 'bg-accent text-on-accent'
              : open
                ? 'bg-soft text-ink'
                : 'text-muted hover:bg-soft hover:text-ink'
          ]"
          @click="activate"
          @pointerdown="startHold"
          @pointerup="cancelHold"
          @pointercancel="cancelHold"
          @pointerleave="cancelHold"
          @keydown.right.prevent="reveal"
          @keydown.down.prevent="reveal"
        >
          <component
            :is="icons[current.id]"
            aria-hidden="true"
            class="size-5 justify-self-center"
            :stroke-width="1.6"
          />
          <kbd
            v-if="showShortcuts"
            class="sr-only"
          >
            {{ current.shortcut }}
          </kbd>
        </button>
        <PopoverTrigger
          v-if="tools.length > 1"
          as-child
        >
          <button
            :aria-label="`More ${label.toLowerCase()}`"
            :title="label"
            class="absolute bottom-0 right-0 flex size-3.5 items-end justify-end rounded-br-md pb-1 pr-1 opacity-40 hover:opacity-100 focus-visible:opacity-100"
            :class="tools.some((tool) => tool.id === active) ? 'text-on-accent' : 'text-muted'"
          >
            <svg
              class="size-1.5"
              viewBox="0 0 8 8"
              aria-hidden="true"
            >
              <path
                d="M6.5 1.5v5h-5Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </PopoverTrigger>
      </div>
    </PopoverAnchor>
    <PopoverContent
      v-if="tools.length > 1"
      :side="orientation === 'horizontal' ? 'bottom' : 'right'"
      align="start"
      :align-offset="-4"
      :side-offset="6"
      :collision-padding="12"
      class="z-50 w-52 rounded-lg border border-line bg-surface p-1.5 text-xs text-ink shadow-lg"
      :aria-label="label"
    >
      <button
        v-for="tool in tools"
        :key="tool.id"
        :aria-label="tool.label"
        :aria-pressed="selected === tool.id"
        class="flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left hover:bg-soft focus-visible:bg-soft focus-visible:outline-none!"
        :class="selected === tool.id ? 'bg-soft text-ink' : 'text-ink'"
        @click="choose(tool.id)"
      >
        <component
          :is="icons[tool.id]"
          class="size-4 shrink-0"
          :stroke-width="1.6"
          aria-hidden="true"
        />
        <span class="flex-1">{{ displayName(tool.label) }}</span>
        <kbd
          v-if="showShortcuts"
          class="min-w-4 text-right text-xs font-normal text-muted opacity-65"
        >
          {{ tool.shortcut }}
        </kbd>
      </button>
    </PopoverContent>
  </PopoverRoot>
</template>
