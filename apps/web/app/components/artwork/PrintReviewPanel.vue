<script setup lang="ts">
import { ref } from 'vue'
import { usePrintReview } from '../../composables/artwork/usePrintReview'
import { useArtwork } from '../../composables/artwork/useArtwork'
import { useComposition } from '../../composables/project/useComposition'
import { useCanvasView } from '../../composables/canvas/useCanvasView'
import { printProfile, type PrintFinding } from '../../utils/preflight'
const r = usePrintReview(),
  a = useArtwork(),
  c = useComposition(),
  view = useCanvasView(),
  error = ref('')
const stale = r.stale
const check = async (download = false) => {
  try {
    const report = await r.run()
    error.value = ''
    if (download && report) {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      )
      const link = document.createElement('a')
      link.href = url
      link.download = 'overprint-print-review.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Review failed.'
  }
}
const pick = (finding: PrintFinding) => {
  c.side.value = finding.side
  if (finding.itemId) a.selection.value = finding.itemId
  r.selected.value = finding.id
  view.focus({ ...finding.bounds, side: finding.side })
}
</script>
<template>
  <section
    class="border-b border-line p-4"
    aria-label="Print checks"
  >
    <h2 class="font-medium">Print checks</h2>
    <p class="mt-1 text-muted">Find thin ink, pad overlaps and artwork outside the board.</p>
    <div class="mt-3 space-y-2">
      <div class="flex gap-2">
        <button
          class="rounded bg-soft p-2"
          :disabled="r.busy.value"
          @click="check()"
        >
          {{ r.busy.value ? 'Checking…' : 'Run print checks' }}
        </button>
        <button
          class="rounded bg-soft p-2"
          :disabled="r.busy.value"
          @click="check(true)"
        >
          Download review
        </button>
      </div>
      <p
        v-if="stale"
        role="status"
      >
        Artwork changed. Run print checks again.
      </p>
      <p v-else-if="r.checked.value && !r.findings.value.length">
        No findings in the checks performed.
      </p>
      <button
        v-for="(finding, index) in r.findings.value"
        :key="finding.id"
        class="block w-full rounded border border-line p-2 text-left"
        :aria-label="`Review finding ${index + 1}: ${finding.code}`"
        @click="pick(finding)"
      >
        {{ index + 1 }}. {{ finding.message }}
      </button>
      <details class="pt-2 text-muted">
        <summary>Printing rules</summary>
        <div class="mt-2 space-y-2">
          <p>{{ printProfile.name }}</p>
          <p class="text-muted">{{ printProfile.note }}</p>
          <a
            :href="printProfile.source"
            target="_blank"
            rel="noopener noreferrer"
            class="underline"
          >
            Profile source
          </a>
        </div>
      </details>
      <p
        v-if="error"
        role="alert"
      >
        {{ error }}
      </p>
    </div>
  </section>
</template>
