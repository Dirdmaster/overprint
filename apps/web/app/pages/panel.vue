<script setup lang="ts">
import { buildPanel } from '~/utils/panel/panelExport'
import { layoutPanel, panelBounds, MAX_PANEL_COPIES } from '~/utils/panel/panelLayout'
import { panelInkPreview } from '~/utils/manufacturingZip'
import { parseProject, type Composition } from '~/utils/project'
import { listProjects, type WorkspaceProjectRecord } from '~/utils/workspaceStore'

definePageMeta({ layout: false })

const route = useRoute()
const workspace = shallowRef<WorkspaceProjectRecord[]>([])
const selected = ref('')
const project = shallowRef<Composition>()
const rows = ref(1)
const columns = ref(2)
const gap = ref(2.5)
const side = ref<'front' | 'back'>('front')
const busy = ref(false)
const ready = ref(false)
const error = ref('')
const result = shallowRef<Awaited<ReturnType<typeof buildPanel>>>()
const previews = shallowRef<{ front: string; back: string }>()
const quantity = computed(() => rows.value * columns.value)
const sources = computed(() =>
  project.value ? [{ bounds: project.value.board.bounds, quantity: quantity.value }] : []
)
const layout = computed(() => {
  if (!project.value) return
  try {
    const placements = layoutPanel(sources.value, { columns: columns.value, gap: gap.value })
    return { placements, bounds: panelBounds(sources.value, placements, gap.value) }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) }
  }
})
const bounds = computed(() => result.value?.board.bounds ?? layout.value?.bounds)
const report = (cause: unknown) => {
  error.value = cause instanceof Error ? cause.message : String(cause)
}

watch(
  [project, rows, columns, gap],
  () => {
    result.value = undefined
    previews.value = undefined
    error.value = ''
  },
  { flush: 'sync' }
)

const chooseProject = async () => {
  project.value = undefined
  const record = workspace.value.find((record) => record.id === selected.value)
  if (!record) return
  busy.value = true
  try {
    project.value = await parseProject(record.composition)
  } catch (cause) {
    report(cause)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  try {
    workspace.value = await listProjects()
    const query = route.query.project
    selected.value =
      typeof query === 'string' && workspace.value.some((p) => p.id === query) ? query : ''
    await chooseProject()
  } catch (cause) {
    report(cause)
  } finally {
    ready.value = true
  }
})

let activeBuild: AbortController | undefined
onBeforeUnmount(() => activeBuild?.abort())

const runBuild = async () => {
  if (!project.value || !layout.value?.placements || busy.value) return
  error.value = ''
  busy.value = true
  const controller = new AbortController()
  activeBuild = controller
  try {
    const panel = await buildPanel(
      project.value.board.name,
      [project.value],
      layout.value.placements,
      gap.value,
      controller.signal
    )
    const front = await panelInkPreview(panel.board, panel.color, 'front')
    const back = await panelInkPreview(panel.board, panel.color, 'back')
    if (controller.signal.aborted) return
    result.value = panel
    previews.value = { front, back }
  } catch (cause) {
    if (!controller.signal.aborted) report(cause)
  } finally {
    busy.value = false
    activeBuild = undefined
  }
}

const download = async () => {
  if (!result.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const url = URL.createObjectURL(await result.value.download())
    const link = document.createElement('a')
    link.href = url
    link.download = `${result.value.board.name.replace(/[^a-z0-9_-]+/gi, '-')}-panel.zip`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) {
    report(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <NuxtLink
          to="/"
          class="text-sm text-muted underline"
        >
          Back to editor
        </NuxtLink>
        <h1 class="mt-2 text-2xl font-semibold">Panel builder</h1>
      </div>
      <ThemeToggle />
    </header>

    <div class="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <section
        class="space-y-4 rounded-xl border border-line bg-surface p-4"
        aria-label="Panel settings"
      >
        <fieldset
          :disabled="busy || !ready"
          class="space-y-4"
        >
          <label class="grid gap-1 text-sm">
            Saved project
            <select
              v-model="selected"
              class="rounded-md border border-line bg-surface p-2"
              @change="chooseProject"
            >
              <option value="">Choose a project</option>
              <option
                v-for="record in workspace"
                :key="record.id"
                :value="record.id"
              >
                {{ record.name }}
              </option>
            </select>
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="grid gap-1 text-sm">
              Rows
              <input
                v-model.number="rows"
                class="min-w-0 rounded-md border border-line p-2"
                type="number"
                min="1"
                :max="MAX_PANEL_COPIES"
              />
            </label>
            <label class="grid gap-1 text-sm">
              Columns
              <input
                v-model.number="columns"
                class="min-w-0 rounded-md border border-line p-2"
                type="number"
                min="1"
                :max="MAX_PANEL_COPIES"
              />
            </label>
          </div>
          <label class="grid gap-1 text-sm">
            Routing gap (mm)
            <input
              v-model.number="gap"
              class="rounded-md border border-line p-2"
              type="number"
              min="2"
              max="5"
              step="0.1"
            />
          </label>
        </fieldset>
        <p
          v-if="ready && !workspace.length"
          class="text-sm text-muted"
        >
          Save a project in Overprint to start a panel.
        </p>
        <p
          v-if="project && !project.board.fabrication"
          class="text-sm"
          role="alert"
        >
          This project needs saved Gerbers and drills. Import fabrication data in the editor and
          save the project.
        </p>
        <p
          v-if="error || layout?.error"
          class="text-sm"
          role="alert"
        >
          {{ error || layout?.error }}
        </p>
        <button
          class="header-action header-action-primary"
          :disabled="busy || !project?.board.fabrication || !layout?.placements"
          @click="runBuild"
        >
          Build preview
        </button>
      </section>

      <section
        class="flex min-h-96 flex-col gap-4 rounded-xl border border-line bg-surface p-4"
        aria-label="Panel preview"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div
            class="flex gap-2"
            aria-label="Panel side"
          >
            <button
              v-for="face in ['front', 'back'] as const"
              :key="face"
              class="header-action capitalize"
              :aria-pressed="side === face"
              @click="side = face"
            >
              {{ face }}
            </button>
          </div>
          <p
            v-if="bounds"
            class="text-sm text-muted"
          >
            {{ bounds.width.toFixed(2) }} × {{ bounds.height.toFixed(2) }} mm · {{ quantity }}
            {{ quantity === 1 ? 'copy' : 'copies' }}
          </p>
        </div>
        <div class="flex flex-1 items-center justify-center rounded-lg bg-black/10 p-5">
          <PanelPreview
            v-if="result && previews"
            :board="result.board"
            :image="previews[side]"
            :side="side"
          />
          <p
            v-else
            class="text-sm text-muted"
          >
            {{ busy ? 'Building panel…' : 'Build the preview to check the layout and both sides.' }}
          </p>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted">
            At JLCPCB, select Panel by Customer and EasyEDA multi-color silkscreen.
          </p>
          <button
            class="header-action"
            :disabled="busy || !result"
            @click="download"
          >
            Download ZIP
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
