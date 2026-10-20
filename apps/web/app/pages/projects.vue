<script setup lang="ts">
import { ArrowLeft, HardDrive, MoreHorizontal, Plus, Search, Upload } from '@lucide/vue'
import { parseProject } from '~/utils/project'
import { loadComposition } from '~/utils/compositionStore'
import {
  createProject,
  deleteProject,
  getWorkspaceMeta,
  listProjects,
  loadProject,
  migrateLegacyProject,
  saveProject,
  setWorkspaceMeta,
  type WorkspaceProjectRecord
} from '~/utils/workspaceStore'

definePageMeta({ layout: false })
useHead({ title: 'Projects | Overprint' })

const projects = ref<WorkspaceProjectRecord[]>([])
const activeId = ref<string>()
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const search = ref('')
const sort = ref<'recent' | 'name'>('recent')
const editing = ref<string>()
const draftName = ref('')
const deleting = ref<string>()
const picker = useTemplateRef('projectPicker')
const refresh = async () => {
  projects.value = await listProjects()
  activeId.value = await getWorkspaceMeta<string>('activeProjectId')
}
onMounted(async () => {
  try {
    const active = await getWorkspaceMeta<string>('activeProjectId')
    if (!active && !(await getWorkspaceMeta<boolean>('legacyMigrated'))) {
      const legacy = (await loadComposition()) ?? localStorage.getItem('overprint-project-v1')
      await migrateLegacyProject(legacy ? await parseProject(legacy) : undefined)
    }
    await refresh()
  } catch (cause) {
    report(cause)
  } finally {
    loading.value = false
  }
})
const report = (cause: unknown) => {
  error.value = cause instanceof Error ? cause.message : 'Could not access this browser workspace.'
}
const run = async (action: () => Promise<void>) => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
    await refresh()
  } catch (cause) {
    report(cause)
  } finally {
    busy.value = false
  }
}
const ordered = computed(() =>
  [...projects.value].sort((a, b) =>
    sort.value === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt
  )
)
const visible = computed(() =>
  ordered.value.filter((project) =>
    project.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())
  )
)
const recent = computed(() =>
  [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)
)
const formattedDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(timestamp)
const dimensions = (project: WorkspaceProjectRecord) => {
  try {
    const { width, height } = JSON.parse(project.composition).board.bounds
    return `${Math.round(width)} × ${Math.round(height)} mm`
  } catch {
    return ''
  }
}
const open = (id: string) =>
  run(async () => {
    if (!(await loadProject(id))) throw new Error('Project no longer exists. Refresh the page.')
    await setWorkspaceMeta('activeProjectId', id)
    await navigateTo('/')
  })
const importProject = (file: File) =>
  run(async () => {
    if (file.size > 20_000_000) throw new Error('Project exceeds 20 MB.')
    const project = await parseProject(await file.text())
    const record = await createProject(file.name.replace(/\.overprint$/i, ''), project)
    await setWorkspaceMeta('activeProjectId', record.id)
    await navigateTo('/')
  })
const chooseProject = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void importProject(file)
}
const duplicate = (id: string) =>
  run(async () => {
    const record = await loadProject(id)
    if (!record) throw new Error('Project no longer exists. Refresh the page.')
    await createProject(`${record.name} copy`, await parseProject(record.composition))
  })
const startRename = (project: WorkspaceProjectRecord) => {
  editing.value = project.id
  draftName.value = project.name
}
const rename = (id: string) =>
  run(async () => {
    const record = await loadProject(id)
    if (!record) throw new Error('Project no longer exists. Refresh the page.')
    await saveProject(
      { ...record, name: draftName.value.trim().slice(0, 200) || record.name },
      record.revision
    )
    editing.value = undefined
  })
const remove = (id: string) =>
  run(async () => {
    const record = projects.value.find((project) => project.id === id)
    if (!record) return
    await deleteProject(id, record.revision)
    if (activeId.value === id) await setWorkspaceMeta('activeProjectId', undefined)
    deleting.value = undefined
  })
</script>

<template>
  <div class="flex min-h-svh flex-col bg-canvas md:flex-row">
    <ProjectsSidebar
      :projects="projects"
      :active-id="activeId"
      :busy="busy"
      @open="open"
    />

    <main class="min-w-0 flex-1 px-4 pb-12 pt-7 sm:px-8 lg:px-11 lg:pt-9">
      <div class="mx-auto max-w-7xl">
        <header class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Projects</h1>
            <p class="mt-1 text-sm text-muted">Your boards and artwork, saved locally.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              class="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-medium hover:bg-soft"
              :disabled="busy"
              @click="picker?.click()"
            >
              <Upload class="size-4" />
              Import project
            </button>
            <NuxtLink
              to="/?import=pcb"
              class="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent hover:opacity-90"
            >
              <Plus class="size-4" />
              New from PCB
            </NuxtLink>
            <input
              ref="projectPicker"
              type="file"
              accept=".overprint,application/json"
              aria-label="Choose project file"
              class="hidden"
              @change="chooseProject"
            />
          </div>
        </header>

        <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label
            class="flex h-10 w-full max-w-2xl items-center gap-2 rounded-lg border border-line bg-surface px-3 text-muted"
          >
            <Search class="size-4 shrink-0" />
            <input
              v-model="search"
              type="search"
              aria-label="Search projects"
              placeholder="Search your projects"
              class="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </label>
          <select
            v-model="sort"
            aria-label="Sort projects"
            class="h-10 rounded-lg border border-line bg-surface px-3 text-xs font-medium"
          >
            <option value="recent">Recently edited</option>
            <option value="name">Name</option>
          </select>
        </div>
        <p
          v-if="error"
          role="alert"
          class="mt-4 rounded-lg border border-line bg-surface p-3 text-sm"
        >
          {{ error }}
        </p>
        <p
          v-if="loading"
          role="status"
          class="mt-10 text-sm text-muted"
        >
          Loading projects…
        </p>
        <template v-else>
          <section
            v-if="recent.length && !search"
            id="recent-projects"
            class="mt-9"
          >
            <h2 class="text-xl font-semibold tracking-tight">Recent projects</h2>
            <p class="mt-1 text-sm text-muted">Continue where you left off</p>
            <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <ProjectPreviewCard
                v-for="project in recent"
                :key="project.id"
                :project="project"
                :active="activeId === project.id"
                :busy="busy"
                @open="open"
              />
            </div>
          </section>

          <section
            class="mt-10"
            aria-labelledby="all-projects-title"
          >
            <div class="flex items-center justify-between gap-3">
              <h2
                id="all-projects-title"
                class="text-xl font-semibold tracking-tight"
              >
                All projects
              </h2>
              <p class="text-xs text-muted">
                {{ visible.length }} {{ visible.length === 1 ? 'project' : 'projects' }}
              </p>
            </div>
            <div
              v-if="!visible.length"
              class="mt-4 rounded-xl border border-line bg-surface px-5 py-10 text-center text-sm text-muted"
            >
              {{
                projects.length
                  ? 'No projects match your search.'
                  : 'No saved projects yet. Import a PCB or an Overprint project to start.'
              }}
            </div>
            <div
              v-else
              class="mt-4 divide-y divide-line rounded-xl border border-line bg-surface px-3 sm:px-4"
            >
              <article
                v-for="project in visible"
                :key="project.id"
                class="flex min-w-0 flex-wrap items-center gap-3 py-3 sm:flex-nowrap"
                :aria-label="project.name"
              >
                <button
                  class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-soft p-1.5"
                  :aria-label="`Open ${project.name}`"
                  :disabled="busy"
                  @click="open(project.id)"
                >
                  <img
                    :src="project.thumbnail"
                    alt=""
                    class="max-h-full max-w-full object-contain"
                  />
                </button>
                <div class="min-w-0 flex-1">
                  <form
                    v-if="editing === project.id"
                    class="flex items-center gap-2"
                    @submit.prevent="rename(project.id)"
                  >
                    <input
                      v-model="draftName"
                      maxlength="200"
                      aria-label="Project name"
                      class="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
                    />
                    <button
                      class="header-action"
                      type="submit"
                      :disabled="busy || !draftName.trim()"
                    >
                      Save
                    </button>
                    <button
                      class="header-action"
                      type="button"
                      @click="editing = undefined"
                    >
                      Cancel
                    </button>
                  </form>
                  <button
                    v-else
                    class="max-w-full truncate text-left text-sm font-semibold hover:underline"
                    :disabled="busy"
                    @click="open(project.id)"
                  >
                    {{ project.name }}
                  </button>
                  <p class="mt-1 text-xs text-muted">
                    Edited {{ formattedDate(project.updatedAt) }}
                  </p>
                </div>
                <span
                  v-if="activeId === project.id"
                  class="rounded-full bg-soft px-2.5 py-1 text-[10px]"
                >
                  Current
                </span>
                <span class="hidden w-28 text-xs text-muted lg:block">
                  {{ dimensions(project) }}
                </span>
                <details
                  class="relative ml-auto shrink-0"
                  :data-project-menu="project.id"
                >
                  <summary
                    class="flex size-8 list-none items-center justify-center rounded-lg text-muted hover:bg-soft hover:text-ink [&::-webkit-details-marker]:hidden"
                    :aria-label="`Project actions for ${project.name}`"
                  >
                    <MoreHorizontal class="size-4" />
                  </summary>
                  <div
                    class="absolute right-0 top-9 z-10 w-36 rounded-lg border border-line bg-surface p-1 shadow-lg"
                  >
                    <button
                      class="action-row !min-h-8 !px-2"
                      :disabled="busy"
                      @click="open(project.id)"
                    >
                      Open
                    </button>
                    <button
                      class="action-row !min-h-8 !px-2"
                      :disabled="busy"
                      @click="startRename(project)"
                    >
                      Rename
                    </button>
                    <button
                      class="action-row !min-h-8 !px-2"
                      :disabled="busy"
                      @click="duplicate(project.id)"
                    >
                      Duplicate
                    </button>
                    <button
                      class="action-row !min-h-8 !px-2"
                      :disabled="busy"
                      @click="deleting = project.id"
                    >
                      Delete
                    </button>
                  </div>
                </details>
                <div
                  v-if="deleting === project.id"
                  class="w-full rounded-lg bg-soft p-3 text-xs"
                >
                  <p>Delete this saved project? This cannot be undone.</p>
                  <div class="mt-2 flex gap-2">
                    <button
                      class="header-action"
                      :disabled="busy"
                      @click="remove(project.id)"
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
                </div>
              </article>
            </div>
          </section>

          <div
            class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted"
          >
            <p class="flex items-center gap-2">
              <HardDrive class="size-4" />
              Projects and libraries are stored in this browser.
            </p>
            <a
              href="#workspace-backup"
              class="font-medium text-ink hover:underline"
            >
              Export workspace backup
            </a>
          </div>
          <div
            id="workspace-backup"
            class="mt-8"
          >
            <WorkspaceBackup
              :flush="async () => true"
              @restored="refresh"
            />
          </div>
          <NuxtLink
            to="/"
            class="mt-8 inline-flex items-center gap-2 text-xs text-muted hover:text-ink"
          >
            <ArrowLeft class="size-4" />
            Back to editor
          </NuxtLink>
        </template>
      </div>
    </main>
  </div>
</template>
