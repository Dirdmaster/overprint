<script setup lang="ts">
import { ref, watch, onBeforeUnmount, useTemplateRef, reactive } from 'vue'
import { hexToHsv, hsvToHex, normalizeHex } from '~/utils/paintColor'
const color = defineModel<string>({ required: true })
const hsv = reactive(hexToHsv(color.value))
const hex = ref(color.value.slice(1).toUpperCase())
const invalid = ref(false)
const field = useTemplateRef('field')
let pointerId: number | undefined
watch(color, (value) => {
  if (hsvToHex(hsv.h, hsv.s, hsv.v) !== value.toLowerCase()) {
    const next = hexToHsv(value)
    // Preserve the chosen hue while crossing white or black.
    if (next.s) hsv.h = next.h
    hsv.s = next.s
    hsv.v = next.v
  }
  hex.value = value.slice(1).toUpperCase()
  invalid.value = false
})
const update = () => {
  color.value = hsvToHex(hsv.h, hsv.s, hsv.v)
}
const move = (event: PointerEvent) => {
  if (pointerId !== event.pointerId) return
  const box = field.value!.getBoundingClientRect()
  hsv.s = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))
  hsv.v = 1 - Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
  update()
}
const start = (event: PointerEvent) => {
  if (event.button !== 0) return
  event.preventDefault()
  field.value?.focus()
  pointerId = event.pointerId
  field.value?.setPointerCapture(event.pointerId)
  move(event)
}
const stop = () => {
  const id = pointerId
  pointerId = undefined
  if (id !== undefined && field.value?.hasPointerCapture(id)) field.value.releasePointerCapture(id)
}
const key = (event: KeyboardEvent) => {
  const step = event.shiftKey ? 0.1 : 0.01
  if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'ArrowLeft') hsv.s = Math.max(0, hsv.s - step)
  if (event.key === 'ArrowRight') hsv.s = Math.min(1, hsv.s + step)
  if (event.key === 'ArrowDown') hsv.v = Math.max(0, hsv.v - step)
  if (event.key === 'ArrowUp') hsv.v = Math.min(1, hsv.v + step)
  update()
}
const applyHex = () => {
  const next = normalizeHex(hex.value)
  invalid.value = !next
  if (next) {
    color.value = next
    hex.value = next.slice(1).toUpperCase()
  }
}
onBeforeUnmount(stop)
</script>

<template>
  <div class="space-y-3">
    <div
      ref="field"
      role="slider"
      tabindex="0"
      aria-label="Saturation and brightness"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(hsv.s * 100)"
      :aria-valuetext="`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`"
      class="relative h-36 touch-none rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
      :style="{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h} 100% 50%)`
      }"
      @pointerdown="start"
      @pointermove="move"
      @pointerup="stop"
      @pointercancel="stop"
      @lostpointercapture="stop"
      @keydown="key"
    >
      <span
        class="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/50"
        :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }"
      />
    </div>
    <input
      v-model.number="hsv.h"
      class="hue-slider block h-3 w-full cursor-pointer appearance-none rounded-full"
      type="range"
      min="0"
      max="360"
      step="1"
      aria-label="Hue"
      @input="update"
    />
    <label class="flex h-8 items-center gap-2 rounded-md border border-line bg-soft px-2 text-xs">
      <span class="text-muted">Hex</span>
      <input
        v-model="hex"
        aria-label="Hex color"
        :aria-invalid="invalid"
        spellcheck="false"
        maxlength="7"
        class="min-w-0 flex-1 bg-transparent font-mono uppercase outline-none"
        @change="applyHex"
        @keydown.enter.prevent.stop="applyHex"
      />
      <span
        class="size-4 rounded-sm border border-black/15"
        :style="{ backgroundColor: color }"
      />
    </label>
    <p
      v-if="invalid"
      role="alert"
      class="text-xs text-muted"
    >
      Enter a hex color, like FF8040.
    </p>
  </div>
</template>

<style scoped>
.hue-slider {
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}
.hue-slider::-webkit-slider-thumb {
  appearance: none;
  width: 1rem;
  height: 1rem;
  border: 2px solid white;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 0 1px #0008;
}
.hue-slider::-moz-range-thumb {
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid white;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 0 1px #0008;
}
</style>
