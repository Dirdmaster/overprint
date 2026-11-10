<script setup lang="ts">
import { TAB_EDGES, type TabEdge } from '~/utils/panel/panelLayout'

defineProps<{ label: string }>()
const edges = defineModel<TabEdge[]>({ required: true })
</script>

<template>
  <fieldset class="space-y-2">
    <legend class="text-xs text-muted">{{ label }}</legend>
    <div class="flex flex-wrap gap-x-4 gap-y-2">
      <label
        v-for="edge in TAB_EDGES"
        :key="edge"
        class="flex items-center gap-1.5 text-sm"
      >
        <input
          v-model="edges"
          type="checkbox"
          :value="edge"
        />
        {{ $t(`panel.edge.${edge}`) }}
      </label>
    </div>
  </fieldset>
</template>
