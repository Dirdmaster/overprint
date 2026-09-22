<script setup lang="ts">
import { ArrowUpRight, Download, LoaderCircle, Pause, Play, TriangleAlert, X } from '@lucide/vue'
import { useExportGuidePlayback } from '~/composables/export/useExportGuidePlayback'
import { uploadJlcZip } from '~/utils/jlcUpload'
import { makeManufacturingZip } from '~/utils/manufacturingZip'
import type { Composition } from '~/utils/project'
const { board, side, silk, maskColor, components } = useComposition()
const { items } = useArtwork()
const { theme } = useTheme()
const dialog = useTemplateRef('dialog')
const busy = ref(false)
const progress = ref('Preparing ZIP…')
const quoteUrl = ref('')
const failed = ref(false)
const guideStep = ref(0)
const guideImageMissing = ref(!useRuntimeConfig().public.guideScreenshots)
const guideImage = useTemplateRef('guideImage')
onMounted(() => {
  // A missing server-rendered image can fail before Vue attaches its listener.
  if (guideImage.value?.complete && !guideImage.value.naturalWidth) guideImageMissing.value = true
})
const guide = [
  {
    label: 'Board finish',
    caption: 'Choose White, ENIG and 1 µin gold.',
    image: 'settings',
    alt: 'JLCPCB settings with White solder mask, ENIG finish and 1 microinch gold selected.'
  },
  {
    label: 'Full color',
    caption: 'Advanced Options → EasyEDA multi-color silkscreen.',
    image: 'multicolor',
    alt: 'JLCPCB Advanced Options with EasyEDA multi-color Silkscreen selected.'
  },
  {
    label: 'Open viewer',
    caption: 'Click Gerber Viewer above the board preview on the JLCPCB quote page.',
    image: 'open-viewer',
    alt: 'Arrow pointing to the Gerber Viewer button above the normal board preview.'
  },
  {
    label: 'Check preview',
    caption: 'In Gerber Viewer, check the artwork on both sides.',
    image: 'viewer',
    alt: 'JLCPCB Gerber Viewer displaying the pink bow above the original white dragon silkscreen.'
  }
] as const
const {
  playing,
  fraction,
  start: startGuide,
  play: playGuide,
  pause: pauseGuide,
  select: selectGuide
} = useExportGuidePlayback(guideStep, guide.length)
const feedback = ref('')
let controller: AbortController | undefined
const show = () => {
  if (!busy.value) {
    feedback.value = ''
    quoteUrl.value = ''
    failed.value = false
  }
  dialog.value?.showModal()
  startGuide()
}
const close = () => {
  controller?.abort()
  pauseGuide()
  dialog.value?.close()
}
const exportZip = async (send: boolean) => {
  if (busy.value || !board.value) return
  if (!board.value.fabrication) {
    feedback.value =
      'This board has no native Gerbers or drill files. Export it with the current KiCad plugin before manufacturing.'
    return
  }
  quoteUrl.value = ''
  failed.value = false
  progress.value = 'Preparing ZIP…'
  busy.value = true
  controller = new AbortController()
  const signal = controller.signal
  feedback.value = ''
  try {
    const snapshot = JSON.parse(
      JSON.stringify({
        version: 1,
        board: board.value,
        artwork: items.value,
        side: side.value,
        silk: silk.value,
        mask: maskColor.value,
        fabrication: components.value
      })
    ) as Composition
    const zip = await makeManufacturingZip(snapshot)
    signal.throwIfAborted()
    if (send) {
      progress.value = 'Uploading…'
      const response = await uploadJlcZip(zip, signal, () => {
        progress.value = 'Retrying…'
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => undefined)
        const reason =
          typeof detail?.statusMessage === 'string'
            ? detail.statusMessage.slice(0, 300)
            : 'Try again or download the ZIP.'
        throw new Error(`JLCPCB upload failed (HTTP ${response.status}): ${reason}`)
      }
      const result = await response.json()
      const destination = new URL(result.quoteUrl)
      if (
        destination.origin !== 'https://cart.jlcpcb.com' ||
        destination.pathname !== '/quote/' ||
        !destination.searchParams.get('homeUploadNum')
      )
        throw new Error('JLCPCB returned an invalid quote link.')
      signal.throwIfAborted()
      const tab = window.open(destination.href, '_blank')
      if (tab) {
        tab.opener = null
        feedback.value = 'Opened in JLCPCB. Check both sides before ordering.'
      } else {
        quoteUrl.value = destination.href
        feedback.value = 'Your quote is ready. Open JLCPCB to continue.'
      }
    } else {
      const url = URL.createObjectURL(zip)
      const link = document.createElement('a')
      link.href = url
      link.download = `${snapshot.board.name}-jlcpcb.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      feedback.value = 'ZIP downloaded.'
    }
  } catch (error) {
    feedback.value = signal.aborted
      ? 'Upload cancelled.'
      : error instanceof Error
        ? error.message
        : 'Could not create the ZIP.'
    failed.value = !signal.aborted
  } finally {
    busy.value = false
    controller = undefined
  }
}
onBeforeUnmount(() => controller?.abort())
defineExpose({ show })
</script>
<template>
  <dialog
    ref="dialog"
    aria-labelledby="jlc-title"
    class="m-auto w-full max-w-7xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-xl backdrop:bg-black/30"
    @cancel.prevent="close"
  >
    <div class="mb-3 flex items-center justify-between gap-3">
      <h2
        id="jlc-title"
        class="font-semibold"
      >
        Export to JLCPCB
      </h2>
      <div class="flex items-center gap-1">
        <button
          class="icon-button"
          aria-label="Close export"
          @click="close"
        >
          <X class="size-4" />
        </button>
      </div>
    </div>
    <div class="mb-3 flex items-center justify-between gap-3 text-xs text-muted">
      <span>JLCPCB setup guide</span>
      <button
        class="header-action"
        :aria-label="playing ? 'Pause guide' : 'Resume guide'"
        @click="playing ? pauseGuide() : playGuide()"
      >
        <Pause v-if="playing" />
        <Play v-else />
        {{ playing ? 'Pause' : 'Resume' }}
      </button>
    </div>
    <div
      class="flex gap-1"
      role="group"
      aria-label="JLCPCB export guide"
    >
      <button
        v-for="(step, index) in guide"
        :key="step.image"
        class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 py-3 text-sm"
        :class="guideStep === index ? 'bg-ink text-surface' : 'bg-soft text-muted'"
        :aria-pressed="guideStep === index"
        @click="selectGuide(index)"
      >
        <span>{{ index + 1 }}</span>
        {{ step.label }}
      </button>
    </div>
    <div
      aria-hidden="true"
      class="mb-3 mt-2 h-1 overflow-hidden rounded-full bg-muted/25"
    >
      <div
        class="h-full origin-left rounded-full bg-ink"
        :class="{
          'transition-transform duration-100 ease-linear motion-reduce:transition-none':
            guideStep > 0 || fraction > 0
        }"
        :style="{
          transform: `scaleX(${(guideStep + fraction) / guide.length})`,
          backgroundColor: theme === 'dark' ? '#fff' : undefined
        }"
      />
    </div>
    <figure>
      <div class="relative block w-full overflow-hidden rounded-lg border border-line bg-white">
        <JlcGuideDiagram
          v-if="guideImageMissing"
          :step="guideStep"
          class="h-[55dvh]"
        />
        <svg
          v-else-if="guideStep === 2"
          viewBox="0 0 455 285"
          role="img"
          :aria-label="guide[guideStep]!.alt"
          class="h-[55dvh] w-full"
        >
          <image
            :href="`/guides/jlcpcb/${guide[guideStep]!.image}.png`"
            width="455"
            height="285"
            @error="guideImageMissing = true"
          />
          <path
            d="M 375 100 L 375 48 M 366 59 L 375 48 L 384 59"
            fill="none"
            stroke="#ef233c"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <img
          v-else
          ref="guideImage"
          :src="`/guides/jlcpcb/${guide[guideStep]!.image}.png`"
          :alt="guide[guideStep]!.alt"
          class="h-[55dvh] w-full object-contain"
          @error="guideImageMissing = true"
        />
      </div>
      <figcaption class="mt-3 text-sm text-ink">{{ guide[guideStep]!.caption }}</figcaption>
    </figure>
    <p
      v-if="guideStep >= 2"
      class="mt-2 flex items-start gap-2 text-xs text-muted"
    >
      <TriangleAlert
        class="size-4 shrink-0"
        aria-hidden="true"
      />
      Colors aren’t shown in the normal quote preview. Use Gerber Viewer to check your color
      artwork.
    </p>
    <a
      class="mt-2 inline-block text-xs text-muted underline underline-offset-2"
      href="https://jlcpcb.com/help/article/how-to-design-multi-color-silkscreen-using-easyeda"
      target="_blank"
      rel="noopener noreferrer"
    >
      JLCPCB guide ↗
    </a>
    <p
      v-if="feedback"
      role="status"
      class="mt-4 text-sm"
    >
      {{ feedback }}
    </p>
    <div class="mt-5 flex justify-end gap-2">
      <button
        class="header-action"
        :disabled="busy"
        @click="exportZip(false)"
      >
        <Download />
        Download ZIP
      </button>
      <a
        v-if="quoteUrl && !busy"
        :href="quoteUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="header-action header-action-primary"
      >
        Open JLCPCB
        <ArrowUpRight />
      </a>
      <button
        v-else
        class="header-action header-action-primary min-w-36 justify-center"
        :disabled="busy"
        :aria-busy="busy"
        @click="exportZip(true)"
      >
        <LoaderCircle
          v-if="busy"
          class="animate-spin motion-reduce:animate-none"
        />
        <span aria-live="polite">{{ busy ? progress : failed ? 'Retry' : 'Send ZIP' }}</span>
        <ArrowUpRight v-if="!busy" />
      </button>
    </div>
  </dialog>
</template>
