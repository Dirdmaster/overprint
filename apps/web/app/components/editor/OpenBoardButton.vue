<script setup lang="ts">
import { ScanLine, Upload, ChevronDown } from '@lucide/vue'
const emit = defineEmits<{ scan: []; import: [] }>()
const menu = useTemplateRef('menu')
const close = () => {
  if (menu.value) menu.value.open = false
  menu.value?.querySelector('summary')?.focus()
}
const dismissOutside = (event: PointerEvent) => {
  if (menu.value && !menu.value.contains(event.target as Node)) menu.value.open = false
}
onMounted(() => document.addEventListener('pointerdown', dismissOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', dismissOutside))
const importBoard = () => {
  close()
  emit('import')
}
</script>

<template>
  <div class="flex items-stretch rounded-md bg-soft">
    <button
      class="header-action rounded-r-none"
      @click="$emit('scan')"
    >
      <ScanLine />
      {{ $t('editor.openFromKicad') }}
    </button>
    <details
      ref="menu"
      class="relative"
      @keydown.esc.prevent.stop="close"
    >
      <summary
        class="header-action h-full cursor-pointer list-none rounded-l-none border-l border-line [&::-webkit-details-marker]:hidden"
        :aria-label="$t('editor.openOptions')"
      >
        <ChevronDown class="size-3.5" />
      </summary>
      <div
        class="absolute right-0 top-full z-30 mt-2 w-48 rounded-lg border border-line bg-surface p-1 shadow-lg"
      >
        <button
          class="action-row w-full"
          @click="importBoard"
        >
          <Upload class="size-4" />
          {{ $t('common.importPcb') }}
        </button>
      </div>
    </details>
  </div>
</template>
