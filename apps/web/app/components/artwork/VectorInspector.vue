<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Artwork } from '../../utils/artwork'
import { useArtwork } from '../../composables/artwork/useArtwork'
import { useVectorArtwork } from '../../composables/artwork/useVectorArtwork'
import { artworkPolygons, vectorFromRings } from '../../utils/vectorArtwork'
const props = defineProps<{ item?: Artwork }>()
const a = useArtwork(),
  { editingNodes, updateVector, booleanSelection } = useVectorArtwork()
const error = ref(''),
  node = ref(0)
watch(
  () => props.item?.id,
  () => {
    node.value = 0
  }
)
const run = async (action: () => unknown) => {
  try {
    await action()
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Vector operation failed.'
  }
}
const convert = () =>
  run(async () => {
    const i = props.item
    if (!i || !a.canPatch(i.id, { source: i.source }) || i.library || i.gold)
      throw new Error('Select an unlocked, detached graphic.')
    const rendered = vectorFromRings(await artworkPolygons(i), i.side)
    if (!a.items.value.includes(i)) throw new Error('Artwork changed while converting.')
    a.edit(i.id, { ...rendered, drawing: undefined, text: undefined })
    editingNodes.value = true
  })
const changeNode = (axis: number, event: Event) =>
  run(() => {
    const i = props.item
    if (!i?.vector) return
    const v = JSON.parse(JSON.stringify(i.vector)),
      value = Number((event.target as HTMLInputElement).value)
    v.contours[0].points[node.value][axis] = value
    updateVector(i.id, v)
  })
const mutate = (remove: boolean) =>
  run(() => {
    const i = props.item
    if (!i?.vector) return
    const v = JSON.parse(JSON.stringify(i.vector)),
      c = v.contours[0]
    if (remove) {
      if (c.points.length <= (c.closed ? 3 : 2))
        throw new Error('This contour needs its remaining nodes.')
      c.points.splice(node.value, 1)
      node.value = Math.max(0, node.value - 1)
    } else {
      const p = c.points[node.value],
        q = c.points[(node.value + 1) % c.points.length]
      c.points.splice(node.value + 1, 0, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2])
      node.value++
    }
    updateVector(i.id, v)
  })
</script>
<template>
  <section
    class="mt-4 space-y-2"
    aria-label="Vector editing"
  >
    <h3 class="font-medium">
      {{ a.selectedArtwork.value.length > 1 ? 'Pathfinder' : 'Path editing' }}
    </h3>
    <div
      v-if="a.selectedArtwork.value.length > 1"
      class="flex flex-wrap gap-1"
    >
      <button
        v-for="op in ['union', 'subtract', 'intersect'] as const"
        :key="op"
        class="rounded bg-soft px-2 py-2 disabled:opacity-40"
        :disabled="a.selectedArtwork.value.length < 2"
        @click="run(() => booleanSelection(op))"
      >
        {{ op === 'union' ? 'Combine' : op === 'subtract' ? 'Subtract top' : 'Intersect' }}
      </button>
    </div>
    <p
      v-if="a.selectedArtwork.value.length > 1"
      class="text-muted"
    >
      Boolean operations create one filled vector; strokes and masked SVGs must be expanded first.
    </p>
    <button
      v-if="item && !item.vector && !item.kind"
      class="rounded bg-soft px-2 py-2"
      @click="convert"
    >
      Convert filled artwork to nodes
    </button>
    <template v-if="item?.vector">
      <button
        class="rounded bg-soft px-2 py-2"
        @click="run(() => a.edit(item!.id, { vector: undefined }))"
      >
        Convert vector to SVG
      </button>
      <label class="flex items-center gap-2">
        <input
          v-model="editingNodes"
          type="checkbox"
        />
        Edit vector nodes
      </label>
      <label class="flex flex-col gap-1">
        Node
        <select
          v-model="node"
          aria-label="Selected vector node"
          class="rounded bg-soft p-2"
        >
          <option
            v-for="(_, index) in item.vector.contours[0]!.points"
            :key="index"
            :value="index"
          >
            {{ index + 1 }}
          </option>
        </select>
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label
          v-for="(axis, index) in ['X', 'Y']"
          :key="axis"
        >
          {{ axis }}
          <input
            type="number"
            step="0.1"
            :aria-label="`Vector node ${axis}`"
            class="w-full rounded bg-soft p-2"
            :value="item.vector.contours[0]!.points[node]?.[index]"
            @change="changeNode(index, $event)"
          />
        </label>
      </div>
      <div class="flex gap-2">
        <button
          class="rounded bg-soft p-2"
          @click="mutate(false)"
        >
          Add node
        </button>
        <button
          class="rounded bg-soft p-2"
          @click="mutate(true)"
        >
          Delete node
        </button>
      </div>
      <label>
        Vector fill
        <input
          type="color"
          aria-label="Vector fill"
          :value="item.vector.fill === 'none' ? '#ffd426' : item.vector.fill"
          @change="
            run(() =>
              updateVector(item!.id, {
                ...item!.vector!,
                fill: ($event.target as HTMLInputElement).value
              })
            )
          "
        />
      </label>
    </template>
    <div
      v-if="item?.vector"
      class="grid grid-cols-2 gap-2"
    >
      <label>
        Vector stroke
        <input
          type="color"
          aria-label="Vector stroke"
          :value="item.vector.stroke === 'none' ? '#ffd426' : item.vector.stroke"
          @change="
            run(() =>
              updateVector(item!.id, {
                ...item!.vector!,
                stroke: ($event.target as HTMLInputElement).value
              })
            )
          "
        />
      </label>
      <label>
        Stroke (mm)
        <input
          type="number"
          step="0.05"
          min="0"
          max="100"
          aria-label="Vector stroke width"
          class="w-full rounded bg-soft p-2"
          :value="item.vector.strokeWidth"
          @change="
            run(() =>
              updateVector(item!.id, {
                ...item!.vector!,
                strokeWidth: Number(($event.target as HTMLInputElement).value)
              })
            )
          "
        />
      </label>
    </div>
    <p
      v-if="error"
      role="alert"
    >
      {{ error }}
    </p>
  </section>
</template>
