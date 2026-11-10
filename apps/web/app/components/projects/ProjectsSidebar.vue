<script setup lang="ts">
import { ArrowUpRight, Clock3, FolderOpen, HardDrive, LayoutGrid } from '@lucide/vue'
import type { WorkspaceProjectRecord } from '~/utils/workspaceStore'
defineProps<{ projects: WorkspaceProjectRecord[]; activeId?: string; busy: boolean }>()
defineEmits<{ open: [id: string] }>()
</script>
<template>
  <aside
    class="flex shrink-0 flex-col border-b border-line bg-surface px-3 py-4 md:min-h-svh md:w-60 md:border-b-0 md:border-r md:px-4 md:py-6"
    aria-label="Workspace navigation"
  >
    <NuxtLink
      to="/"
      class="flex items-center gap-3 px-2 text-lg font-semibold"
      aria-label="Overprint editor"
    >
      <span class="flex size-8 items-center justify-center rounded-lg bg-weavers text-white">
        <LayoutGrid class="size-4" />
      </span>
      Overprint
    </NuxtLink>
    <div class="mt-5 flex gap-1 md:mt-12 md:flex-col">
      <p
        class="hidden px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted md:block"
      >
        Workspace
      </p>
      <NuxtLink
        to="/projects"
        class="flex min-h-9 items-center gap-2.5 rounded-lg bg-soft px-3 text-sm font-medium"
        aria-current="page"
      >
        <LayoutGrid class="size-4" />
        Projects
      </NuxtLink>
      <a
        href="#recent-projects"
        class="flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-muted hover:bg-soft hover:text-ink"
      >
        <Clock3 class="size-4" />
        Recent
      </a>
      <NuxtLink
        to="/?library=1"
        class="flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-muted hover:bg-soft hover:text-ink"
        title="Open the library in the editor"
      >
        <FolderOpen class="size-4" />
        Library
      </NuxtLink>
    </div>
    <div
      v-if="activeId && projects.find((project) => project.id === activeId)"
      class="mt-8 hidden border-t border-line pt-5 md:block"
    >
      <p class="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
        Quick access
      </p>
      <button
        class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-soft"
        @click="$emit('open', activeId!)"
      >
        <ArrowUpRight class="size-4 text-muted" />
        <span class="truncate">
          {{ projects.find((project) => project.id === activeId)?.name }}
        </span>
      </button>
    </div>
    <p class="mt-auto hidden border-t border-line px-2 pt-5 text-xs text-muted md:block">
      <HardDrive class="mb-2 size-4" />
      Only on this browser
      <br />
      Export a backup anytime.
    </p>
  </aside>
</template>
