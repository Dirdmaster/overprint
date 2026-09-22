<script setup lang="ts">
import ColorSpectrum from './ColorSpectrum.vue'
import { ref, computed, nextTick, useTemplateRef } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'
const color = defineModel<string>({ required: true })
const props = defineProps<{
  label: string
  presets: { name: string; color: string }[]
  custom?: boolean
}>()
const trigger = useTemplateRef('trigger')
const panel = useTemplateRef('panel')
const opened = ref(false)
const position = ref({ left: '0px', top: '0px' })
const selected = computed(() => props.presets.find((preset) => preset.color === color.value))
const close = () => {
  panel.value?.hidePopover()
  opened.value = false
  trigger.value?.focus()
}
const show = () => {
  if (opened.value) {
    close()
    return
  }
  const box = trigger.value!.getBoundingClientRect()
  panel.value?.showPopover()
  opened.value = true
  const bounds = panel.value!.getBoundingClientRect()
  position.value = {
    left: `${Math.max(8, Math.min(box.right - bounds.width, window.innerWidth - bounds.width - 8))}px`,
    top: `${Math.max(8, Math.min(box.bottom + 8, window.innerHeight - bounds.height - 8))}px`
  }
  nextTick(() =>
    (
      panel.value?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      panel.value?.querySelector<HTMLElement>('[role="slider"]')
    )?.focus()
  )
}
const choose = (value: string) => {
  color.value = value
  if (!props.custom) close()
}
const navigate = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if ((event.target as HTMLElement)?.closest('input, [role="slider"]')) return
  const buttons = [...(panel.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  const index = buttons.indexOf(
    (panel.value?.getRootNode() as Document | ShadowRoot)?.activeElement as HTMLButtonElement
  )
  const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[event.key]
  if (offset === undefined) return
  event.preventDefault()
  buttons[(index + offset + buttons.length) % buttons.length]?.focus()
}
</script>
<template>
  <button
    ref="trigger"
    class="flex h-8 min-w-28 items-center gap-2 rounded-md border border-line bg-soft px-2 text-left"
    :aria-label="`${label}: ${selected?.name ?? color}`"
    aria-haspopup="dialog"
    :aria-expanded="opened"
    @click="show"
  >
    <span
      class="size-5 shrink-0 rounded-sm border border-black/15"
      :style="{ backgroundColor: color }"
    />
    <span class="flex-1">{{ selected?.name ?? color }}</span>
    <ChevronDown class="size-3.5 text-muted" />
  </button>
  <div
    ref="panel"
    popover="auto"
    role="dialog"
    :aria-label="label"
    class="fixed m-0 w-68 rounded-lg border border-line bg-surface p-3 text-ink shadow-xl"
    :style="position"
    @toggle="opened = ($event as ToggleEvent).newState === 'open'"
    @keydown="navigate"
  >
    <p class="mb-3 text-xs font-medium">{{ label }}</p>
    <ColorSpectrum
      v-if="custom"
      v-model="color"
      class="mb-3"
    />
    <div
      class="grid grid-cols-6 gap-2"
      role="group"
      aria-label="Color presets"
    >
      <button
        v-for="preset in presets"
        :key="preset.color"
        class="flex h-8 items-center justify-center rounded-md border border-black/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        :style="{ backgroundColor: preset.color }"
        :aria-label="preset.name"
        :title="preset.name"
        :aria-pressed="color === preset.color"
        @click="choose(preset.color)"
      >
        <Check
          v-if="color === preset.color"
          class="size-5 rounded bg-black/60 p-0.5 text-white"
        />
      </button>
    </div>
  </div>
</template>
