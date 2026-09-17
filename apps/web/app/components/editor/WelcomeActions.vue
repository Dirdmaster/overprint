<script setup lang="ts">
import { ArrowRight, BookOpen, FolderOpen, ScanLine, Upload } from '@lucide/vue'
defineEmits<{ scan: []; import: []; setup: []; openProject: [] }>()
</script>

<template>
  <section
    class="w-full max-w-md px-4 text-center"
    :aria-label="$t('editor.welcome.label')"
  >
    <h1 class="text-3xl font-semibold tracking-tight">Overprint</h1>
    <p class="mt-8 text-base text-muted">{{ $t('editor.welcome.description') }}</p>
    <div class="mx-auto mt-8 flex max-w-sm flex-col gap-1.5 px-4 sm:px-5">
      <button
        class="action-row bg-soft text-ink"
        @click="$emit('scan')"
      >
        <ScanLine
          class="size-4"
          aria-hidden="true"
        />
        {{ $t('editor.welcome.scan') }}
        <ArrowRight
          class="ml-auto size-4"
          aria-hidden="true"
        />
      </button>
      <button
        class="action-row"
        @click="$emit('import')"
      >
        <Upload
          class="size-4"
          aria-hidden="true"
        />
        {{ $t('common.importPcb') }}
        <ArrowRight
          class="ml-auto size-4"
          aria-hidden="true"
        />
      </button>
      <button
        class="action-row"
        @click="$emit('openProject')"
      >
        <FolderOpen
          class="size-4"
          aria-hidden="true"
        />
        {{ $t('common.openProject') }}
      </button>
      <button
        class="action-row"
        @click="$emit('setup')"
      >
        <BookOpen
          class="size-4"
          aria-hidden="true"
        />
        {{ $t('common.kicadSetup') }}
      </button>
    </div>
    <p class="mt-8 text-xs text-muted">{{ $t('editor.welcome.dropHint') }}</p>
  </section>
</template>
