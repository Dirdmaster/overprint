<script setup lang="ts">
import type { WorkspaceProjectRecord } from '~/utils/workspaceStore'
defineProps<{ project: WorkspaceProjectRecord; active: boolean; busy: boolean }>()
defineEmits<{ open: [id: string] }>()
const formattedDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(timestamp)
</script>
<template>
  <article class="min-w-0 rounded-xl border border-line bg-surface p-2.5">
    <button
      class="flex h-40 w-full items-center justify-center overflow-hidden rounded-lg bg-soft p-4 sm:h-44"
      :aria-label="`Open ${project.name}`"
      :disabled="busy"
      @click="$emit('open', project.id)"
    >
      <img
        :src="project.thumbnail"
        alt=""
        class="max-h-full max-w-full object-contain"
      />
    </button>
    <div class="flex items-start justify-between gap-2 px-1.5 pb-1 pt-3">
      <div class="min-w-0">
        <h3 class="truncate text-sm font-semibold">{{ project.name }}</h3>
        <p class="mt-1 text-xs text-muted">Edited {{ formattedDate(project.updatedAt) }}</p>
      </div>
      <span
        v-if="active"
        class="rounded-full bg-soft px-2 py-1 text-[10px]"
      >
        Current
      </span>
    </div>
  </article>
</template>
