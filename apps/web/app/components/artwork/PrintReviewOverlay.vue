<script setup lang="ts">
import { usePrintReview } from '../../composables/artwork/usePrintReview'
defineProps<{ side: string }>()
const { findings, selected } = usePrintReview()
</script>
<template>
  <g
    pointer-events="none"
    aria-label="Print review overlay"
  >
    <template
      v-for="(finding, index) in findings"
      :key="finding.id"
    >
      <g
        v-if="finding.side === side && finding.itemId"
        :opacity="selected === finding.id ? 1 : 0.65"
        data-print-finding
      >
        <rect
          :x="finding.bounds.x"
          :y="finding.bounds.y"
          :width="finding.bounds.width"
          :height="finding.bounds.height"
          fill="none"
          :stroke="finding.severity === 'blocker' ? '#e63136' : '#d78e12'"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
        <text
          :x="finding.bounds.x"
          :y="finding.bounds.y"
          font-size="1.8"
          fill="#e63136"
        >
          {{ index + 1 }}
        </text>
      </g>
    </template>
  </g>
</template>
