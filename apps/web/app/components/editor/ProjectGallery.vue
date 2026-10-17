<script setup lang="ts">
import type { WorkspaceProjectRecord } from '~/utils/workspaceStore'
defineProps<{ projects: WorkspaceProjectRecord[]; activeId?: string; busy: boolean }>()
const emit = defineEmits<{
  open: [id: string]
  rename: [id: string, name: string]
  duplicate: [id: string]
  remove: [id: string]
  import: []
  new: []
}>()
const dialog = useTemplateRef('dialog')
const names = reactive<Record<string, string>>({})
const deleting = ref<string>()
let returnFocus: HTMLElement | undefined
const show = () => {
  returnFocus = document.activeElement as HTMLElement
  dialog.value?.showModal()
}
const close = () => {
  dialog.value?.close()
  returnFocus?.focus()
}
const launch = (action: 'new' | 'import') => {
  close()
  if (action === 'new') emit('new')
  else emit('import')
}
const confirmDelete = (id: string) => {
  emit('remove', id)
  deleting.value = undefined
}
defineExpose({ show, close })
</script>
<template>
  <dialog
    ref="dialog"
    aria-labelledby="projects-title"
    class="m-auto max-h-[85svh] w-3xl max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-xl"
    @close="returnFocus?.focus()"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2
        id="projects-title"
        class="text-lg font-semibold"
      >
        Projects
      </h2>
      <div class="flex flex-wrap gap-2">
        <button
          class="header-action"
          :disabled="busy"
          @click="launch('new')"
        >
          New from PCB
        </button>
        <button
          class="header-action"
          :disabled="busy"
          @click="launch('import')"
        >
          Import project
        </button>
        <button
          class="header-action"
          @click="close"
        >
          Close
        </button>
      </div>
    </div>
    <p class="mt-2 text-sm text-muted">
      Saved in this browser. Download projects to keep a backup.
    </p>
    <p
      v-if="!projects.length"
      class="py-8 text-muted"
    >
      No saved projects yet. Import a PCB to start.
    </p>
    <div class="mt-5 grid gap-4 sm:grid-cols-2">
      <article
        v-for="project in projects"
        :key="project.id"
        class="rounded-xl border border-line p-4"
      >
        <img
          :src="project.thumbnail"
          alt="Board silhouette"
          class="h-28 w-full object-contain"
        />
        <p class="mt-3 font-medium">
          {{ project.name }}
          <span
            v-if="activeId === project.id"
            class="text-xs text-muted"
          >
            Current
          </span>
        </p>
        <p class="text-xs text-muted">{{ new Date(project.updatedAt).toLocaleString() }}</p>
        <label class="mt-3 block text-sm">
          Project name
          <input
            v-model="names[project.id]"
            :placeholder="project.name"
            maxlength="200"
            class="mt-1 w-full rounded border border-line bg-surface p-2"
          />
        </label>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="header-action"
            :disabled="busy"
            @click="emit('open', project.id)"
          >
            Open
          </button>
          <button
            class="header-action"
            :disabled="busy || !names[project.id]?.trim()"
            @click="emit('rename', project.id, names[project.id]!)"
          >
            Rename
          </button>
          <button
            class="header-action"
            :disabled="busy"
            @click="emit('duplicate', project.id)"
          >
            Duplicate
          </button>
          <button
            class="header-action"
            :disabled="busy"
            @click="deleting = project.id"
          >
            Delete
          </button>
        </div>
        <div
          v-if="deleting === project.id"
          class="mt-3 text-sm"
        >
          <p>Delete this saved project? This cannot be undone.</p>
          <button
            class="header-action"
            :disabled="busy"
            @click="confirmDelete(project.id)"
          >
            Confirm deletion
          </button>
          <button
            class="header-action"
            @click="deleting = undefined"
          >
            Cancel
          </button>
        </div>
      </article>
    </div>
  </dialog>
</template>
