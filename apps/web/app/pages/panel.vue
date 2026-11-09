<script setup lang="ts">
import { buildPanel } from '~/utils/panel/panelExport'
import {
  layoutPanel,
  panelBounds,
  MAX_PANEL_COPIES,
  MAX_PANEL_DESIGNS,
  placedBounds,
  type Rotation,
  type PanelPlacement
} from '~/utils/panel/panelLayout'
import { panelInkPreview } from '~/utils/manufacturingZip'
import {
  listPanels,
  loadPanel,
  pinDesign,
  readPanel,
  savePanel,
  type PanelDesign,
  type PanelSummary
} from '~/utils/panel/panelStore'
import { listProjects, loadProject, type WorkspaceProjectRecord } from '~/utils/workspaceStore'

definePageMeta({ layout: false })

const route = useRoute()
const workspace = shallowRef<WorkspaceProjectRecord[]>([])
const selected = ref('')
const designs = shallowRef<PanelDesign[]>([])
const savedPanels = shallowRef<PanelSummary[]>([])
const savedPanelId = ref('')
const savedRevision = ref(0)
const panelName = ref('')
const notice = ref('')
const latestSource = (id: string) => workspace.value.find((record) => record.id === id)
const sourceChanged = (design: PanelDesign) => {
  const latest = latestSource(design.record.id)
  return (
    !!latest &&
    latest.revision > design.record.revision &&
    (latest.composition !== design.record.composition || latest.name !== design.record.name)
  )
}
const reloadWorkspace = async () => {
  const [projects, panels] = await Promise.all([listProjects(), listPanels()])
  workspace.value = projects
  savedPanels.value = panels
}
const adjusted = shallowRef<PanelPlacement[]>()
const stackupConfirmed = ref(false)
const mixed = computed(() => designs.value.length > 1)
const available = computed(() =>
  workspace.value.filter(
    (record) => !designs.value.some((design) => design.record.id === record.id)
  )
)
const rows = ref(1)
const columns = ref(2)
const gap = ref(2.5)
const side = ref<'front' | 'back'>('front')
const busy = ref(false)
const ready = ref(false)
const error = ref('')
type BuiltPreview = { panel: Awaited<ReturnType<typeof buildPanel>>; front: string; back: string }
const preview = shallowRef<BuiltPreview>()
const pending = shallowRef<{
  designName: string
  designs: PanelDesign[]
  placements: PanelPlacement[]
  preview: BuiltPreview
}>()
const refreshConfirmed = ref(false)
const displayed = computed(() => pending.value?.preview ?? preview.value)
const built = computed(() => displayed.value?.panel)
const title = computed(
  () =>
    panelName.value.trim() ||
    (mixed.value ? 'Mixed designs' : designs.value[0]?.record.name || 'Untitled panel')
)
const sources = computed(() =>
  designs.value.map((design) => ({
    bounds: design.project.board.bounds,
    quantity: mixed.value ? design.record.quantity : rows.value * columns.value
  }))
)
const quantity = computed(() => sources.value.reduce((total, source) => total + source.quantity, 0))
const fabricationError = computed(() => {
  const layers = new Set<number>()
  for (const { record, project } of designs.value) {
    const fabrication = project.board.fabrication
    if (!fabrication)
      return `${record.name} needs saved Gerbers and drills. Import fabrication data in the editor and save the project.`
    if (![2, 4].includes(fabrication.copperLayers))
      return `${record.name} needs two or four copper layers for color export.`
    layers.add(fabrication.copperLayers)
  }
  return layers.size > 1 ? 'All designs must have the same number of copper layers.' : ''
})
const layout = computed(() => {
  if (!designs.value.length) return
  try {
    if (!mixed.value && (!Number.isInteger(rows.value) || rows.value < 1))
      throw new Error('Choose a whole number of rows.')
    const startingLayout = layoutPanel(sources.value, { columns: columns.value, gap: gap.value })
    const placements = adjusted.value ?? startingLayout
    return { placements, bounds: panelBounds(sources.value, placements, gap.value) }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : String(cause) }
  }
})
const bounds = computed(() => built.value?.board.bounds ?? layout.value?.bounds)
const report = (cause: unknown) => {
  error.value = cause instanceof Error ? cause.message : String(cause)
}

watch(
  [designs, rows, columns, gap],
  () => {
    adjusted.value = undefined
  },
  { flush: 'sync' }
)
watch(
  [designs, rows, columns, gap, adjusted, stackupConfirmed],
  () => {
    preview.value = undefined
    notice.value = ''
    error.value = ''
  },
  { flush: 'sync' }
)

const addProject = async () => {
  if (!selected.value || busy.value || designs.value.length >= MAX_PANEL_DESIGNS) return
  busy.value = true
  try {
    const record = await loadProject(selected.value)
    if (!record) throw new Error('This project is no longer in the workspace.')
    const pinned = await pinDesign({ ...record, quantity: 1 })
    const current = designs.value.map((design, i) => ({
      ...design,
      record: { ...design.record, quantity: sources.value[i]!.quantity }
    }))
    designs.value = [...current, pinned]
    stackupConfirmed.value = false
    selected.value = ''
  } catch (cause) {
    report(cause)
  } finally {
    busy.value = false
  }
}

const removeProject = (index: number) => {
  const remaining = designs.value.filter((_, i) => i !== index)
  if (designs.value.length > 1 && remaining.length === 1) {
    columns.value = Math.max(1, remaining[0]!.record.quantity || 1)
    rows.value = 1
  }
  designs.value = remaining
  stackupConfirmed.value = false
}

const setQuantity = (index: number, quantity: number) => {
  designs.value = designs.value.map((design, i) =>
    i === index ? { ...design, record: { ...design.record, quantity } } : design
  )
}

const placementBounds = (placement: PanelPlacement) =>
  placedBounds(sources.value[placement.source]!.bounds, placement)

const setPlacement = (index: number, field: 'x' | 'y' | 'rotation', value: number) => {
  if (!Number.isFinite(value) || Math.abs(value) > 1000 || !layout.value?.placements) return
  adjusted.value = layout.value.placements.map((current, i) => {
    if (i !== index) return current
    const before = placementBounds(current)
    const next = {
      ...current,
      rotation: field === 'rotation' ? (value as Rotation) : current.rotation
    }
    const after = placementBounds(next)
    return {
      ...next,
      x: next.x + (field === 'x' ? value : before.x) - after.x,
      y: next.y + (field === 'y' ? value : before.y) - after.y
    }
  })
}

onMounted(async () => {
  try {
    await reloadWorkspace()
    if (typeof route.query.panel === 'string') {
      await openPanel(route.query.panel)
      return
    }
    const query = route.query.project
    selected.value =
      typeof query === 'string' && workspace.value.some((p) => p.id === query) ? query : ''
    await addProject()
  } catch (cause) {
    report(cause)
  } finally {
    ready.value = true
  }
})

const onFocus = () => {
  void reloadWorkspace().catch(report)
}
onMounted(() => window.addEventListener('focus', onFocus))
let activeBuild: AbortController | undefined
onBeforeUnmount(() => {
  activeBuild?.abort()
  window.removeEventListener('focus', onFocus)
})

const buildPreview = async (current: PanelDesign[], placements: PanelPlacement[]) => {
  const controller = new AbortController()
  activeBuild = controller
  try {
    const panel = await buildPanel(
      title.value,
      current.map((design) => design.project),
      placements,
      gap.value,
      controller.signal
    )
    const front = await panelInkPreview(panel.board, panel.color, 'front')
    const back = await panelInkPreview(panel.board, panel.color, 'back')
    if (controller.signal.aborted) throw new DOMException('Panel build cancelled.', 'AbortError')
    return { panel, front, back }
  } finally {
    activeBuild = undefined
  }
}

const runBuild = async () => {
  if (
    !layout.value?.placements ||
    busy.value ||
    fabricationError.value ||
    (mixed.value && !stackupConfirmed.value)
  )
    return
  error.value = ''
  busy.value = true
  try {
    preview.value = await buildPreview(designs.value, layout.value.placements)
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'AbortError')) report(cause)
  } finally {
    busy.value = false
  }
}

const openPanel = async (id: string) => {
  if (!id || busy.value) return
  busy.value = true
  try {
    const saved = await loadPanel(id)
    if (!saved) throw new Error('This panel is no longer in the workspace.')
    const { record, designs: pinned } = await readPanel(saved)
    designs.value = pinned
    rows.value = record.rows
    columns.value = record.columns
    gap.value = record.gap
    stackupConfirmed.value = record.stackupConfirmed
    adjusted.value = record.placements
    panelName.value = record.name
    savedPanelId.value = record.id
    savedRevision.value = record.revision
    notice.value = 'Panel reopened from its pinned project revisions.'
  } catch (cause) {
    report(cause)
  } finally {
    busy.value = false
  }
}

const newPanel = () => {
  designs.value = []
  rows.value = 1
  columns.value = 2
  gap.value = 2.5
  stackupConfirmed.value = false
  panelName.value = ''
  savedPanelId.value = ''
  savedRevision.value = 0
}

const save = async (copy = false) => {
  if (!layout.value?.placements || busy.value || pending.value) return
  busy.value = true
  error.value = ''
  try {
    const record = await savePanel({
      version: 1,
      id: !copy && savedPanelId.value ? savedPanelId.value : crypto.randomUUID(),
      revision: copy ? 0 : savedRevision.value,
      updatedAt: 0,
      name: copy ? `${title.value} copy`.slice(0, 200) : title.value,
      rows: rows.value,
      columns: columns.value,
      gap: gap.value,
      stackupConfirmed: stackupConfirmed.value,
      designs: designs.value.map((design, i) => ({
        ...design.record,
        quantity: sources.value[i]!.quantity
      })),
      placements: layout.value.placements
    })
    savedPanelId.value = record.id
    savedRevision.value = record.revision
    panelName.value = record.name
    await reloadWorkspace()
    notice.value = 'Panel saved in this browser.'
  } catch (cause) {
    report(cause)
  } finally {
    busy.value = false
  }
}

const reviewRefresh = async (index: number) => {
  if (!layout.value?.placements || busy.value || pending.value) return
  const old = designs.value[index]!
  busy.value = true
  error.value = ''
  try {
    const latest = await loadProject(old.record.id)
    if (!latest || latest.revision <= old.record.revision)
      throw new Error('There is no newer saved revision of this project.')
    const next = await pinDesign({ ...latest, quantity: old.record.quantity })
    const updated = designs.value.map((design, i) => (i === index ? next : design))
    const placements = layout.value.placements.map((placement) => {
      if (placement.source !== index) return placement
      const before = placedBounds(old.project.board.bounds, placement)
      const after = placedBounds(next.project.board.bounds, placement)
      return {
        ...placement,
        x: placement.x + before.x - after.x,
        y: placement.y + before.y - after.y
      }
    })
    const candidate = await buildPreview(updated, placements)
    pending.value = {
      designName: next.record.name,
      designs: updated,
      placements,
      preview: candidate
    }
    refreshConfirmed.value = false
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'AbortError')) report(cause)
  } finally {
    busy.value = false
  }
}

const applyRefresh = () => {
  if (!pending.value || (mixed.value && !refreshConfirmed.value)) return
  const candidate = pending.value
  designs.value = candidate.designs
  adjusted.value = candidate.placements
  if (mixed.value) stackupConfirmed.value = refreshConfirmed.value
  preview.value = candidate.preview
  pending.value = undefined
  notice.value = 'New revision applied. Save the panel to keep this change.'
}

const download = async () => {
  if (!preview.value || busy.value || pending.value) return
  busy.value = true
  error.value = ''
  try {
    const url = URL.createObjectURL(await preview.value.panel.download())
    const link = document.createElement('a')
    link.href = url
    link.download = `${title.value.replace(/[^a-z0-9_-]+/gi, '-')}-panel.zip`
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
          :disabled="busy || !ready || !!pending"
          class="space-y-4"
        >
          <label
            v-if="savedPanels.length"
            class="grid gap-1 text-sm"
          >
            Open saved panel
            <select
              aria-label="Open saved panel"
              :value="savedPanelId"
              class="rounded-md border border-line bg-surface p-2"
              @change="openPanel(($event.target as HTMLSelectElement).value)"
            >
              <option
                value=""
                disabled
              >
                Choose a saved panel
              </option>
              <option
                v-for="panel in savedPanels"
                :key="panel.id"
                :value="panel.id"
              >
                {{ panel.name }}
              </option>
            </select>
          </label>
          <button
            v-if="savedPanelId"
            type="button"
            class="header-action"
            @click="newPanel"
          >
            New panel
          </button>
          <label class="grid gap-1 text-sm">
            Panel name
            <input
              v-model="panelName"
              class="rounded-md border border-line p-2"
              :placeholder="title"
              maxlength="200"
            />
          </label>
          <label class="grid gap-1 text-sm">
            Add saved project
            <select
              v-model="selected"
              :disabled="designs.length >= MAX_PANEL_DESIGNS"
              class="rounded-md border border-line bg-surface p-2"
              @change="addProject"
            >
              <option value="">Choose a project</option>
              <option
                v-for="record in available"
                :key="record.id"
                :value="record.id"
              >
                {{ record.name }}
              </option>
            </select>
          </label>
          <ul
            v-if="designs.length"
            class="space-y-2"
            aria-label="Panel designs"
          >
            <li
              v-for="(design, i) in designs"
              :key="design.record.id"
              class="space-y-2 rounded-md border border-line p-2"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="break-all text-sm font-medium">{{ design.record.name }}</span>
                <button
                  class="header-action"
                  type="button"
                  :aria-label="`Remove ${design.record.name}`"
                  @click="removeProject(i)"
                >
                  Remove
                </button>
              </div>
              <p
                v-if="!latestSource(design.record.id)"
                class="text-xs text-muted"
              >
                Source removed. Using pinned revision {{ design.record.revision }}.
              </p>
              <div
                v-else-if="sourceChanged(design)"
                class="space-y-1"
              >
                <p class="text-xs text-muted">
                  New revision available. Using pinned revision {{ design.record.revision }}.
                </p>
                <button
                  type="button"
                  class="header-action"
                  @click="reviewRefresh(i)"
                >
                  Review newer revision
                </button>
              </div>
              <label
                v-if="mixed"
                class="grid gap-1 text-sm"
              >
                {{ design.record.name }} copies
                <input
                  :value="design.record.quantity"
                  class="rounded-md border border-line p-2"
                  type="number"
                  min="1"
                  :max="MAX_PANEL_COPIES"
                  @input="setQuantity(i, ($event.target as HTMLInputElement).valueAsNumber)"
                />
              </label>
            </li>
          </ul>
          <div
            class="grid gap-3"
            :class="mixed ? 'grid-cols-1' : 'grid-cols-2'"
          >
            <label
              v-if="!mixed"
              class="grid gap-1 text-sm"
            >
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
          <label
            v-if="mixed && !fabricationError"
            class="flex items-start gap-2 text-sm"
          >
            <input
              v-model="stackupConfirmed"
              class="mt-1"
              type="checkbox"
            />
            The designs use the same board material, thickness, copper weights, stackup and finish.
          </label>
          <PanelPlacements
            v-if="mixed && layout?.placements"
            :placements="layout.placements"
            :sources="sources"
            :names="designs.map((design) => design.record.name)"
            @edit="setPlacement"
            @reset="adjusted = undefined"
          />
        </fieldset>
        <p
          v-if="ready && !workspace.length && !designs.length"
          class="text-sm text-muted"
        >
          Save a project in Overprint to start a panel.
        </p>
        <p
          v-if="fabricationError"
          class="text-sm"
          role="alert"
        >
          {{ fabricationError }}
        </p>
        <p
          v-if="designs.length >= MAX_PANEL_DESIGNS"
          class="text-sm text-muted"
        >
          This panel has the maximum of ten designs.
        </p>
        <p
          v-if="error || layout?.error"
          class="text-sm"
          role="alert"
        >
          {{ error || layout?.error }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            class="header-action header-action-primary"
            :disabled="
              busy ||
              !!pending ||
              !!fabricationError ||
              !layout?.placements ||
              (mixed && !stackupConfirmed)
            "
            @click="runBuild"
          >
            Build preview
          </button>
          <button
            class="header-action"
            :disabled="busy || !!pending || !layout?.placements"
            @click="save()"
          >
            Save panel
          </button>
          <button
            v-if="savedPanelId"
            class="header-action"
            :disabled="busy || !!pending || !layout?.placements"
            @click="save(true)"
          >
            Save copy
          </button>
        </div>
        <p
          v-if="notice"
          class="text-sm text-muted"
          role="status"
        >
          {{ notice }}
        </p>
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
            <template v-if="mixed">· {{ designs.length }} designs</template>
          </p>
        </div>
        <div
          v-if="pending"
          class="space-y-2 rounded-md border border-line p-3"
        >
          <p class="text-sm">
            Previewing the newer revision of {{ pending.designName }}. Check both sides before
            applying.
          </p>
          <label
            v-if="mixed"
            class="flex items-start gap-2 text-sm"
          >
            <input
              v-model="refreshConfirmed"
              class="mt-1"
              type="checkbox"
            />
            The updated design still uses the same fabrication settings as the others.
          </label>
          <div class="flex flex-wrap gap-2">
            <button
              class="header-action header-action-primary"
              :disabled="mixed && !refreshConfirmed"
              @click="applyRefresh"
            >
              Apply revision
            </button>
            <button
              class="header-action"
              @click="pending = undefined"
            >
              Cancel refresh
            </button>
          </div>
        </div>
        <div class="flex flex-1 items-center justify-center rounded-lg bg-black/10 p-5">
          <PanelPreview
            v-if="displayed"
            :board="displayed.panel.board"
            :image="displayed[side]"
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
            <span v-if="mixed">
              Enter {{ designs.length }} designs. Mixed designs can incur extra charges.
            </span>
          </p>
          <button
            class="header-action"
            :disabled="busy || !!pending || !preview"
            @click="download"
          >
            Download ZIP
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
