<script setup lang="ts">
import type { BoardPackage } from '~/utils/boardPackage'
import { boardSurface } from '~/utils/boardSurface'
import type { PanelFiducials } from '~/utils/panel/panelCam'
import type { Composition } from '~/utils/project'
import { PANEL_RAIL, type PanelPlacement } from '~/utils/panel/panelLayout'

const props = defineProps<{
  bounds: BoardPackage['bounds']
  board?: BoardPackage
  biteHoles?: string
  fiducials?: PanelFiducials
  projects: Composition[]
  placements: PanelPlacement[]
  side: 'front' | 'back'
}>()
const visibleFiducials = computed(() => {
  const marks = props.fiducials
  return marks && (marks.side === 'both' || marks.side === props.side) ? marks : undefined
})
const materialMask = useId()
const surfaceId = (source: number) => `${materialMask}-board-${source}`
const viewBox = computed(() => {
  const { x, y, width, height } = props.bounds
  return `${x} ${y} ${width} ${height}`
})
const transform = computed(() => {
  const { x, width } = props.bounds
  return props.side === 'back' ? `translate(${2 * x + width} 0) scale(-1 1)` : undefined
})
const rect = (x: number, y: number, width: number, height: number) =>
  `M${x},${y} h${width} v${height} h${-width} Z`
const railOutline = computed(() => {
  const { x, y, width, height } = props.bounds
  return [
    rect(x, y, width, height),
    rect(x + PANEL_RAIL, y + PANEL_RAIL, width - 2 * PANEL_RAIL, height - 2 * PANEL_RAIL)
  ].join(' ')
})
const copies = computed(() =>
  props.placements.map(({ source, x, y, rotation }) => ({
    source,
    project: props.projects[source]!,
    transform: `translate(${x} ${y}) rotate(${rotation})`
  }))
)

const surfaces = shallowRef(new Map<Composition, string>())
const cache = new WeakMap<Composition, Partial<Record<'front' | 'back', Promise<string>>>>()
const render = (project: Composition, side: 'front' | 'back') => {
  const cached = cache.get(project) ?? {}
  cached[side] ??= boardSurface(project.board, project.artwork, side, project.silk, project.mask)
    .then((canvas) => canvas.toDataURL())
    .catch(() => '')
  cache.set(project, cached)
  return cached[side]
}
watch(
  [() => props.projects, () => props.side],
  ([projects, side], _, onCleanup) => {
    let current = true
    onCleanup(() => {
      current = false
    })
    surfaces.value = new Map()
    void Promise.all(
      projects.map(async (project) => [project, await render(project, side)] as const)
    ).then((images) => {
      if (current) surfaces.value = new Map(images)
    })
  },
  { immediate: true }
)
</script>

<template>
  <svg
    class="max-h-[65svh] w-full overflow-visible"
    :viewBox="viewBox"
    role="img"
    :aria-label="side === 'front' ? $t('panel.frontPreview') : $t('panel.backPreview')"
  >
    <defs>
      <mask
        v-if="board"
        :id="materialMask"
        maskUnits="userSpaceOnUse"
        :x="bounds.x"
        :y="bounds.y"
        :width="bounds.width"
        :height="bounds.height"
      >
        <path
          :d="board.outline"
          fill="white"
          fill-rule="evenodd"
        />
        <path
          :d="board.holes"
          fill="black"
        />
      </mask>
      <template
        v-for="(project, source) in projects"
        :key="source"
      >
        <image
          v-if="surfaces.get(project)"
          :id="surfaceId(source)"
          :href="surfaces.get(project)"
          v-bind="project.board.bounds"
          preserveAspectRatio="none"
        />
      </template>
    </defs>
    <g :transform="transform">
      <path
        v-if="!board"
        :d="railOutline"
        :fill="projects[0]?.mask"
        fill-rule="evenodd"
        class="stroke-muted/50"
        stroke-width=".12"
      />
      <g :mask="board ? `url(#${materialMask})` : undefined">
        <path
          v-if="board"
          :d="board.outline"
          :fill="projects[0]?.mask"
          fill-rule="evenodd"
        />
        <g
          v-for="(copy, index) in copies"
          :key="index"
          :transform="copy.transform"
        >
          <path
            :d="`${copy.project.board.outline} ${copy.project.board.holes}`"
            :fill="copy.project.mask"
            fill-rule="evenodd"
          />
          <use
            v-if="surfaces.get(copy.project)"
            :href="`#${surfaceId(copy.source)}`"
          />
        </g>
      </g>
      <g v-if="visibleFiducials">
        <g
          v-for="([x, y], index) in visibleFiducials.points"
          :key="index"
        >
          <circle
            :cx="x"
            :cy="y"
            :r="visibleFiducials.maskDiameter / 2"
            class="fill-soft stroke-muted"
            stroke-width=".08"
          />
          <circle
            :cx="x"
            :cy="y"
            :r="visibleFiducials.copperDiameter / 2"
            fill="#c9a661"
          />
        </g>
      </g>
      <path
        v-if="biteHoles"
        :d="biteHoles"
        class="pointer-events-none fill-canvas stroke-ink/65"
        stroke-width=".1"
      />
      <path
        v-if="board"
        :d="board.outline"
        fill="none"
        class="stroke-muted/50"
        stroke-width=".12"
      />
    </g>
  </svg>
</template>
