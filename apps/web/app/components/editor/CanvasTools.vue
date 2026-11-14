<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasTools } from '../../composables/canvas/useCanvasTools'
useCanvasTools()
import CanvasToolGroup from './CanvasToolGroup.vue'
import { canvasToolDefinitions, canvasToolGroups } from '../../utils/canvasTools'
import type { CanvasTool } from '../../utils/drawing'
const props = withDefaults(
  defineProps<{
    tools?: CanvasTool[]
    orientation?: 'horizontal' | 'vertical'
    showShortcuts?: boolean
  }>(),
  {
    tools: () => canvasToolDefinitions.map((tool) => tool.id),
    orientation: 'vertical',
    showShortcuts: true
  }
)
const groups = computed(() =>
  canvasToolGroups
    .map((group) => ({
      ...group,
      tools: canvasToolDefinitions.filter(
        (tool) => tool.group === group.id && props.tools.includes(tool.id)
      )
    }))
    .filter((group) => group.tools.length)
)
</script>
<template>
  <div
    :class="orientation === 'horizontal' ? 'flex-row' : 'flex-col'"
    :aria-orientation="orientation"
    class="flex gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-lg shadow-black/10"
    part="toolbar"
    role="toolbar"
    :aria-label="$t('editor.tools.label')"
  >
    <template
      v-for="(group, index) in groups"
      :key="group.id"
    >
      <span
        v-if="index && group.id === 'navigation'"
        role="separator"
        :aria-orientation="orientation === 'horizontal' ? 'vertical' : 'horizontal'"
        class="bg-line"
        :class="orientation === 'horizontal' ? 'mx-1 w-px self-stretch' : 'my-1 h-px self-stretch'"
      />
      <CanvasToolGroup
        :id="group.id"
        :label="group.label"
        :tools="group.tools"
        :orientation="orientation"
        :show-shortcuts="showShortcuts"
      />
    </template>
  </div>
</template>
