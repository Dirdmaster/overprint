<script setup lang="ts">
import { useCanvasTools } from '../../composables/canvas/useCanvasTools'
import { shapeTools, shapeNames, type CanvasTool } from '../../utils/drawing'
import {
  Hand,
  MousePointer2,
  PaintBucket,
  Square,
  RectangleHorizontal,
  Circle,
  Minus
} from '@lucide/vue'
withDefaults(
  defineProps<{
    tools?: CanvasTool[]
    orientation?: 'horizontal' | 'vertical'
    showShortcuts?: boolean
  }>(),
  {
    tools: () => ['select', 'hand', 'paint', ...shapeTools],
    orientation: 'vertical',
    showShortcuts: true
  }
)
const { selected, active } = useCanvasTools()
</script>

<template>
  <div
    :class="orientation === 'horizontal' ? 'flex-row' : 'flex-col'"
    :aria-orientation="orientation"
    class="flex gap-2 rounded-lg bg-surface p-1"
    part="toolbar"
    role="toolbar"
    :aria-label="$t('editor.tools.label')"
  >
    <button
      v-if="tools.includes('select')"
      part="tool-button"
      :aria-label="$t('editor.tools.select')"
      :aria-pressed="active === 'select'"
      :title="$t('editor.tools.select')"
      class="relative flex size-9 items-center justify-center rounded-md"
      :class="active === 'select' ? 'bg-accent text-on-accent' : 'text-muted'"
      @click="selected = 'select'"
    >
      <MousePointer2
        class="size-4.5"
        aria-hidden="true"
      />
      <kbd
        v-if="showShortcuts"
        class="absolute bottom-0.5 right-1 text-[0.5rem]"
      >
        V
      </kbd>
    </button>
    <button
      v-if="tools.includes('hand')"
      part="tool-button"
      :aria-label="$t('editor.tools.hand')"
      :aria-pressed="active === 'hand'"
      :title="$t('editor.tools.hand')"
      class="relative flex size-9 items-center justify-center rounded-md"
      :class="active === 'hand' ? 'bg-accent text-on-accent' : 'text-muted'"
      @click="selected = 'hand'"
    >
      <Hand
        class="size-4.5"
        aria-hidden="true"
      />
      <kbd
        v-if="showShortcuts"
        class="absolute bottom-0.5 right-1 text-[0.5rem]"
      >
        ␣
      </kbd>
    </button>
    <button
      v-if="tools.includes('paint')"
      part="tool-button"
      :aria-label="$t('editor.tools.paint')"
      :aria-pressed="active === 'paint'"
      :title="$t('editor.tools.paint')"
      class="relative flex size-9 items-center justify-center rounded-md"
      :class="active === 'paint' ? 'bg-accent text-on-accent' : 'text-muted'"
      @click="selected = 'paint'"
    >
      <PaintBucket
        class="size-4.5"
        aria-hidden="true"
      />
      <kbd
        v-if="showShortcuts"
        class="absolute bottom-0.5 right-1 text-[0.5rem]"
      >
        K
      </kbd>
    </button>
    <button
      v-for="tool in shapeTools.filter((tool) => tools.includes(tool))"
      :key="tool"
      part="tool-button"
      :aria-label="`Draw ${shapeNames[tool].toLowerCase()}`"
      :title="`Draw ${shapeNames[tool].toLowerCase()}`"
      :aria-pressed="active === tool"
      class="relative flex size-9 items-center justify-center rounded-md"
      :class="active === tool ? 'bg-accent text-on-accent' : 'text-muted'"
      @click="selected = tool"
    >
      <component
        :is="
          {
            rectangle: Square,
            roundedRectangle: RectangleHorizontal,
            ellipse: Circle,
            line: Minus
          }[tool]
        "
        class="size-4.5"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
