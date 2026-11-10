<script setup lang="ts">
import { MAX_PANEL_COPIES, MAX_PANEL_DESIGNS } from '~/utils/panel/panelLayout'

definePageMeta({ layout: false })

const {
  adjusted,
  addProject,
  available,
  bounds,
  busy,
  canDownload,
  checking,
  columns,
  controlledTabs,
  optimizeTabs,
  designs,
  displayed,
  download,
  error,
  fabricationError,
  gap,
  layout,
  mixed,
  newPanel,
  notice,
  openPanel,
  panelName,
  pending,
  previewError,
  previewProjects,
  quantity,
  ready,
  refreshConfirmed,
  removeProject,
  reviewRefresh,
  rows,
  save,
  savedPanelId,
  savedPanels,
  selected,
  setPlacement,
  setQuantity,
  setTabOverride,
  side,
  sources,
  stackupConfirmed,
  tabCount,
  tabEdges,
  title,
  workspace,
  applyRefresh,
  sourceChanged,
  latestSource
} = usePanelBuilder()
</script>

<template>
  <main class="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <NuxtLink
          to="/"
          class="text-sm text-muted underline"
        >
          {{ $t('common.backToEditor') }}
        </NuxtLink>
        <h1 class="mt-2 text-2xl font-semibold">{{ $t('panel.heading') }}</h1>
      </div>
      <ThemeToggle />
    </header>

    <div class="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <section
        class="space-y-4 rounded-xl border border-line bg-surface p-4"
        :aria-label="$t('panel.settings')"
      >
        <fieldset
          :disabled="busy || !ready || !!pending"
          class="space-y-4"
        >
          <PanelDocumentControls
            v-model="panelName"
            :saved-panels="savedPanels"
            :saved-panel-id="savedPanelId"
            :title="title"
            @open="openPanel"
            @new-panel="newPanel"
          />
          <label class="grid gap-1 text-sm">
            {{ $t('panel.addProject') }}
            <select
              v-model="selected"
              :disabled="designs.length >= MAX_PANEL_DESIGNS"
              class="rounded-md border border-line bg-surface p-2"
              @change="addProject"
            >
              <option value="">{{ $t('panel.chooseProject') }}</option>
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
            :aria-label="$t('panel.designList')"
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
                  :aria-label="$t('panel.removeDesign', { name: design.record.name })"
                  @click="removeProject(i)"
                >
                  {{ $t('panel.remove') }}
                </button>
              </div>
              <p
                v-if="!latestSource(design.record.id)"
                class="text-xs text-muted"
              >
                {{ $t('panel.missingSource', { revision: design.record.revision }) }}
              </p>
              <div
                v-else-if="sourceChanged(design)"
                class="space-y-1"
              >
                <p class="text-xs text-muted">
                  {{ $t('panel.newerSource', { revision: design.record.revision }) }}
                </p>
                <button
                  type="button"
                  class="header-action"
                  @click="reviewRefresh(i)"
                >
                  {{ $t('panel.reviewRevision') }}
                </button>
              </div>
              <label
                v-if="mixed"
                class="grid gap-1 text-sm"
              >
                {{ $t('panel.copiesByDesign', { name: design.record.name }) }}
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
              {{ $t('panel.rows') }}
              <input
                v-model.number="rows"
                class="min-w-0 rounded-md border border-line p-2"
                type="number"
                min="1"
                :max="MAX_PANEL_COPIES"
              />
            </label>
            <label class="grid gap-1 text-sm">
              {{ $t('panel.columns') }}
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
            {{ $t('panel.gap') }}
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
            {{ $t('panel.sameStack') }}
          </label>
          <div class="space-y-3 border-t border-line pt-3">
            <label class="flex items-center gap-2 text-sm font-medium">
              <input
                v-model="controlledTabs"
                type="checkbox"
              />
              {{ $t('panel.controlledTabs') }}
            </label>
            <template v-if="controlledTabs">
              <PanelTabEdges
                v-model="tabEdges"
                :label="$t('panel.allowedTabEdges')"
              />
              <label class="flex items-center gap-2 text-sm">
                <input
                  v-model="optimizeTabs"
                  type="checkbox"
                />
                {{ $t('panel.optimizeTabs') }}
              </label>
              <p
                v-if="optimizeTabs"
                class="text-xs text-muted"
              >
                {{ $t('panel.optimizeTabsHint') }}
              </p>
              <label
                v-else
                class="grid gap-1 text-sm"
              >
                {{ $t('panel.tabsPerEdge') }}
                <input
                  v-model.number="tabCount"
                  class="rounded-md border border-line p-2"
                  type="number"
                  min="1"
                  max="4"
                />
              </label>
              <p class="text-xs text-muted">{{ $t('panel.tabEdgeHint') }}</p>
            </template>
          </div>
          <PanelPlacements
            v-if="(mixed || controlledTabs) && layout?.placements"
            :placements="layout.placements"
            :sources="sources"
            :names="designs.map((design) => design.record.name)"
            :tab-edges="controlledTabs ? tabEdges : undefined"
            @edit="setPlacement"
            @override-tabs="setTabOverride"
            @reset="adjusted = undefined"
          />
        </fieldset>
        <p
          v-if="ready && !workspace.length && !designs.length"
          class="text-sm text-muted"
        >
          {{ $t('panel.startHint') }}
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
          {{ $t('panel.maxDesigns') }}
        </p>
        <p
          v-if="error || layout?.error || previewError"
          class="text-sm"
          role="alert"
        >
          {{ error || layout?.error || previewError }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            class="header-action"
            :disabled="busy || !!pending || !layout?.placements"
            @click="save()"
          >
            {{ $t('panel.save') }}
          </button>
          <button
            v-if="savedPanelId"
            class="header-action"
            :disabled="busy || !!pending || !layout?.placements"
            @click="save(true)"
          >
            {{ $t('panel.copy') }}
          </button>
        </div>
        <p
          v-if="notice"
          class="text-sm text-muted"
          role="status"
        >
          {{ notice.message }}
        </p>
      </section>

      <section
        class="flex min-h-96 flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-4 lg:self-start"
        :aria-label="$t('panel.preview')"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div
            class="flex gap-2"
            :aria-label="$t('panel.side')"
          >
            <button
              v-for="face in ['front', 'back'] as const"
              :key="face"
              class="header-action capitalize"
              :aria-pressed="side === face"
              @click="side = face"
            >
              {{ face === 'front' ? $t('panel.front') : $t('panel.back') }}
            </button>
          </div>
          <p
            v-if="bounds"
            class="text-sm text-muted"
          >
            {{
              $t('panel.dimensions', {
                width: bounds.width.toFixed(2),
                height: bounds.height.toFixed(2)
              })
            }}
            ·
            {{ $t('panel.copyCount', quantity) }}
            <template v-if="mixed">· {{ $t('panel.designCount', designs.length) }}</template>
          </p>
        </div>
        <PanelRevisionReview
          v-if="pending"
          v-model="refreshConfirmed"
          :name="pending.designName"
          :mixed="mixed"
          @apply="applyRefresh"
          @cancel="pending = undefined"
        />
        <div class="flex flex-1 items-center justify-center rounded-lg bg-canvas p-4 sm:p-6">
          <PanelPreview
            v-if="bounds && layout?.placements"
            :bounds="bounds"
            :board="displayed?.board"
            :projects="previewProjects"
            :placements="pending?.placements ?? layout.placements"
            :side="side"
          />
          <p
            v-else
            class="text-sm text-muted"
          >
            {{ $t('panel.previewHint') }}
          </p>
        </div>
        <p
          v-if="checking && !pending"
          class="text-sm text-muted"
          aria-live="polite"
        >
          {{ $t('panel.checkingLayout') }}
        </p>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted">
            {{ $t('panel.quoteHint') }}
            <span v-if="mixed">
              {{ $t('panel.mixedQuoteHint', { count: designs.length }) }}
            </span>
          </p>
          <button
            class="header-action header-action-primary"
            :disabled="!canDownload"
            @click="download"
          >
            {{ $t('panel.downloadZip') }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
