import { buildPanel } from '~/utils/panel/panelExport'
import {
  layoutPanel,
  panelBounds,
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

export const usePanelBuilder = () => {
  const route = useRoute()
  const { t } = useI18n()
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
      (mixed.value ? t('panel.mixedTitle') : designs.value[0]?.record.name || t('panel.untitled'))
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
        return t('panel.needsFabrication', { name: record.name })
      if (![2, 4].includes(fabrication.copperLayers))
        return t('panel.needsLayers', { name: record.name })
      layers.add(fabrication.copperLayers)
    }
    return layers.size > 1 ? t('panel.layersMismatch') : ''
  })
  const layout = computed(() => {
    if (!designs.value.length) return
    try {
      if (!mixed.value && (!Number.isInteger(rows.value) || rows.value < 1))
        throw new Error(t('panel.invalidRows'))
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
      if (!record) throw new Error(t('panel.deletedProject'))
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
      if (!saved) throw new Error(t('panel.deletedPanel'))
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
      notice.value = t('panel.reopened')
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
        name: copy ? t('panel.copyTitle', { name: title.value }).slice(0, 200) : title.value,
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
      notice.value = t('panel.saved')
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
        throw new Error(t('panel.noNewRevision'))
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
    notice.value = t('panel.revisionApplied')
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
  return {
    adjusted, addProject, available, bounds, busy, columns, designs, displayed, download, error,
    fabricationError, gap, layout, mixed, newPanel, notice, openPanel, panelName, pending, preview,
    quantity, ready, refreshConfirmed, removeProject, reviewRefresh, rows, runBuild, save, savedPanelId,
    savedPanels, selected, setPlacement, setQuantity, side, sources, stackupConfirmed, title, workspace,
    applyRefresh, sourceChanged, latestSource
  }
}
