<script setup lang="ts">
import ColorSwatchPicker from '../color/ColorSwatchPicker.vue'
import { LockKeyhole } from '@lucide/vue'
import type { BoardPackage } from '../../utils/boardPackage'

defineProps<{ board: BoardPackage }>()
const mask = defineModel<string>('mask', { required: true })
const presets = [
  { name: 'Black', color: '#202723' },
  { name: 'White', color: '#ebece5' },
  { name: 'Green', color: '#185c39' },
  { name: 'Blue', color: '#214b82' },
  { name: 'Red', color: '#8d2929' },
  { name: 'Purple', color: '#563575' }
]
</script>

<template>
  <section class="px-4 pb-8 pt-4">
    <h2 class="mb-5 font-medium">Properties</h2>
    <p class="mb-1.5 text-muted">Board geometry</p>
    <h3 class="truncate text-sm font-medium">{{ board.name }}</h3>
    <div
      class="mt-4 grid grid-cols-2 gap-2"
      :aria-label="`${board.bounds.width} × ${board.bounds.height} mm`"
    >
      <div
        v-for="(dimension, label) in { W: board.bounds.width, H: board.bounds.height }"
        :key="label"
        class="flex items-center gap-2 rounded bg-soft px-2 py-2"
      >
        <span class="text-muted">{{ label }}</span>
        <span class="flex-1">{{ dimension }} mm</span>
        <LockKeyhole class="size-3.5 text-muted" />
      </div>
    </div>
    <div
      v-if="board.browserImport"
      class="mt-4 space-y-2 text-xs text-muted"
      role="note"
      aria-label="PCB file import"
    >
      <p>
        Imported locally from a KiCad PCB. Connect through the plugin for native Gerbers, drills,
        and 3D models.
      </p>
      <details v-if="board.browserImport.warnings.length">
        <summary class="cursor-pointer">
          Import notes ({{ board.browserImport.warnings.length }})
        </summary>
        <ul class="mt-2 list-disc space-y-2 pl-4">
          <li
            v-for="warning in board.browserImport.warnings"
            :key="warning"
          >
            {{ warning }}
          </li>
        </ul>
      </details>
    </div>
    <div class="mt-6 border-t border-line pt-4">
      <h3 class="mb-4 font-medium">Preview</h3>
      <div class="flex items-center justify-between gap-2">
        <span>Background</span>
        <ColorSwatchPicker
          v-model="mask"
          label="Printed background"
          :presets="presets"
          custom
        />
      </div>
      <p class="mt-2 text-xs text-muted">Printed over white solder mask.</p>
    </div>
  </section>
</template>
