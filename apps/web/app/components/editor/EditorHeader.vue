<script setup lang="ts">
import { RefreshCw, Download, ArrowUpRight, FolderOpen } from '@lucide/vue'
defineProps<{
  syncing?: boolean
  syncSucceeded?: boolean
  syncError?: string
  syncProgress?: string
}>()
defineEmits<{
  import: []
  save: []
  openProject: []
  send: []
  sync: []
  scan: []
}>()
</script>
<template>
  <header class="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-2">
    <AlphaBadge />
    <nav
      class="ml-auto flex flex-wrap items-center justify-end gap-1.5"
      :aria-label="$t('editor.actions')"
    >
      <button
        class="header-action"
        :class="{ 'header-action-success': syncSucceeded }"
        :aria-busy="syncing"
        :title="syncing ? syncProgress : syncSucceeded ? $t('editor.syncSucceeded') : undefined"
        :disabled="syncing"
        @click="$emit('sync')"
      >
        <RefreshCw :class="{ 'animate-spin motion-reduce:animate-none': syncing }" />
        {{ $t('editor.sync') }}
      </button>
      <OpenBoardButton
        @scan="$emit('scan')"
        @import="$emit('import')"
      />
      <button
        class="header-action"
        :title="$t('common.openProject')"
        :aria-label="$t('common.openProject')"
        @click="$emit('openProject')"
      >
        <FolderOpen />
      </button>
      <button
        class="header-action"
        @click="$emit('save')"
      >
        <Download />
        <span class="hidden sm:inline">{{ $t('common.saveProject') }}</span>
        <span class="sr-only sm:hidden">{{ $t('common.saveProject') }}</span>
      </button>
      <button
        class="header-action header-action-primary"
        @click="$emit('send')"
      >
        {{ $t('export.sendToJlcpcb') }}
        <ArrowUpRight />
      </button>
      <ThemeToggle />
    </nav>
    <p
      v-if="syncing"
      role="status"
      class="sr-only"
    >
      {{ syncProgress }}
    </p>
    <p
      v-if="syncError"
      role="alert"
      class="w-full text-right text-xs text-muted"
    >
      {{ syncError }}
    </p>
  </header>
</template>
