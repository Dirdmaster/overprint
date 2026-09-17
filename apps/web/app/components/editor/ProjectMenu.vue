<script setup lang="ts">
import { Menu, Upload, FolderOpen, BookOpen, Monitor, ScanLine } from '@lucide/vue'
const emit = defineEmits<{
  import: [setup: boolean, trigger: HTMLElement | undefined]
  openProject: []
  scan: []
}>()
const menu = useTemplateRef('menu')
const { followSystem } = useTheme()

const close = () => {
  const trigger = menu.value?.querySelector('summary')
  if (menu.value) menu.value.open = false
  trigger?.focus()
  return trigger ?? undefined
}
const importBoard = (setup = false) => {
  emit('import', setup, close())
}
const openProject = () => {
  close()
  emit('openProject')
}
const scan = () => {
  close()
  emit('scan')
}
const useSystemTheme = () => {
  followSystem()
  close()
}
</script>

<template>
  <details
    ref="menu"
    class="relative z-10"
    @keydown.esc.prevent.stop="close"
  >
    <summary
      class="icon-button list-none [&::-webkit-details-marker]:hidden"
      :aria-label="$t('editor.projectMenu')"
      :title="$t('editor.projectMenu')"
    >
      <Menu class="size-4.5" />
    </summary>
    <nav
      :aria-label="$t('editor.projectActions')"
      class="absolute left-0 top-11 w-52 rounded-lg border border-line bg-surface p-1 shadow-lg"
    >
      <button
        class="action-row"
        @click="scan"
      >
        <ScanLine class="size-4" />
        {{ $t('editor.openFromKicad') }}
      </button>
      <button
        class="action-row"
        @click="importBoard()"
      >
        <Upload class="size-4" />
        {{ $t('common.importPcb') }}
      </button>
      <button
        class="action-row"
        @click="openProject"
      >
        <FolderOpen class="size-4" />
        {{ $t('common.openProject') }}
      </button>
      <button
        class="action-row"
        @click="importBoard(true)"
      >
        <BookOpen class="size-4" />
        {{ $t('common.kicadSetup') }}
      </button>
      <button
        class="action-row"
        @click="useSystemTheme"
      >
        <Monitor class="size-4" />
        {{ $t('common.theme.useSystem') }}
      </button>
    </nav>
  </details>
</template>
