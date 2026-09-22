<script setup lang="ts">
import { kicadSetupSteps } from '~/utils/kicadSetup'
import { BookOpen, ChevronDown, Upload, X } from '@lucide/vue'
import type { BoardPackage } from '~/utils/boardPackage'
import { readBoardFile } from '~/utils/readBoardFile'
const props = defineProps<{ confirmReplacement: () => Promise<boolean> }>()
const { t } = useI18n()
const emit = defineEmits<{ imported: [board: BoardPackage] }>()
let request = 0
let controller: AbortController | undefined
const dialog = useTemplateRef('dialog')
const picker = useTemplateRef('picker')
const expanded = ref(false)
const feedback = ref('')
const dragging = ref(false)
let dragDepth = 0
let returnFocus: HTMLElement | undefined

const show = (setup = false, trigger?: HTMLElement) => {
  returnFocus = trigger
  expanded.value = setup
  feedback.value = ''
  if (!dialog.value?.open) dialog.value?.showModal()
}
const receiveFiles = async (files: FileList | null) => {
  const file = files?.[0]
  if (!file) return
  controller?.abort()
  const current = ++request
  if (files!.length !== 1) {
    feedback.value = t('kicad.import.oneFile')
    return
  }
  controller = new AbortController()
  feedback.value = t('kicad.import.opening')
  try {
    const board = await readBoardFile(file, controller.signal)
    if (current !== request) return
    const accepted = await props.confirmReplacement()
    if (current !== request) return
    if (!accepted) {
      feedback.value = ''
      return
    }
    emit('imported', board)
    dialog.value?.close()
  } catch (error) {
    if (current === request)
      feedback.value = error instanceof Error ? error.message : t('kicad.import.failed')
  }
}
const onFileChange = (event: Event) => {
  receiveFiles((event.target as HTMLInputElement).files)
  if (picker.value) picker.value.value = ''
}
const enter = () => {
  dragDepth++
  dragging.value = true
}
const leave = () => {
  dragDepth = Math.max(0, dragDepth - 1)
  dragging.value = dragDepth > 0
}
const drop = (event: DragEvent) => {
  dragDepth = 0
  dragging.value = false
  receiveFiles(event.dataTransfer?.files ?? null)
}
const trapFocus = (event: KeyboardEvent) => {
  if (event.key !== 'Tab') return
  const controls = [
    ...(dialog.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not([type="hidden"])'
    ) ?? [])
  ].filter((control) => control.getClientRects().length > 0)
  const first = controls[0]
  const last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
const resetDrag = () => {
  dragDepth = 0
  dragging.value = false
}
const onClose = () => {
  request++
  controller?.abort()
  resetDrag()
  returnFocus?.focus()
  returnFocus = undefined
}
onBeforeUnmount(() => controller?.abort())
defineExpose({ show, receiveFiles })
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="import-title"
    class="m-auto max-h-[90svh] w-xl max-w-[calc(100%-2rem)] overflow-y-auto rounded-xl border-0 bg-surface p-6 text-ink shadow-xl"
    @keydown="trapFocus"
    @close="onClose"
    @dragover.prevent
    @drop.prevent.stop="drop"
  >
    <header class="mb-7 flex items-center justify-between">
      <h2
        id="import-title"
        class="text-xl font-semibold"
      >
        {{ $t('common.importPcb') }}
      </h2>
      <button
        class="flex size-6 items-center justify-center text-muted"
        :aria-label="$t('kicad.import.close')"
        autofocus
        @click="dialog?.close()"
      >
        <X class="size-4" />
      </button>
    </header>
    <div
      class="flex min-h-58 flex-col items-center justify-center rounded-lg border border-dashed border-line bg-soft/40 px-4 py-7"
      :class="{ 'ring-2 ring-muted': dragging }"
      @dragenter.prevent="enter"
      @dragleave.prevent="leave"
      @dragover.prevent
    >
      <span class="mb-5 flex size-10 items-center justify-center rounded-lg bg-soft text-muted">
        <Upload
          class="size-5"
          aria-hidden="true"
        />
      </span>
      <p class="mb-6 text-center text-base font-semibold">{{ $t('kicad.import.dropHint') }}</p>
      <button
        class="primary-button"
        @click="picker?.click()"
      >
        {{ $t('common.chooseFile') }}
      </button>
      <input
        ref="picker"
        type="file"
        accept=".kicad_pcb,.overprint-board,.zip"
        class="hidden"
        :aria-label="$t('kicad.import.chooseExport')"
        @change="onFileChange"
      />
    </div>
    <p class="mt-3 text-xs text-muted">{{ $t('kicad.import.localHint') }}</p>
    <p
      v-if="feedback"
      class="mt-4 text-sm text-muted"
      role="status"
    >
      {{ feedback }}
    </p>
    <div class="mt-6 border-t border-line pt-4">
      <button
        class="flex min-h-8 items-center gap-3 text-sm text-muted"
        :aria-expanded="expanded"
        aria-controls="kicad-steps"
        @click="expanded = !expanded"
      >
        <ChevronDown
          class="size-4 transition-transform"
          :class="{ '-rotate-90': !expanded }"
          aria-hidden="true"
        />
        {{ $t('kicad.import.showSetup') }}
      </button>
      <section
        v-show="expanded"
        id="kicad-steps"
        class="mt-5"
        :aria-label="$t('kicad.setup.stepsLabel')"
      >
        <ol class="space-y-6">
          <li
            v-for="(step, index) in kicadSetupSteps"
            :key="step.id"
            class="flex gap-3"
          >
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full bg-soft text-xs text-muted"
            >
              {{ index + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <h3 class="pt-0.5 text-sm font-medium">{{ $t(step.titleKey) }}</h3>
              <p class="mt-2 text-xs leading-relaxed text-muted">{{ $t(step.descriptionKey) }}</p>
              <PcmRepositoryLink v-if="'action' in step && step.action === 'copy-repository'" />
            </div>
          </li>
        </ol>
        <p class="mt-6 text-xs text-muted">{{ $t('kicad.setup.fallback') }}</p>
        <a
          href="/downloads/overprint-kicad.zip"
          download
          class="mt-2 inline-block text-xs underline"
        >
          {{ $t('common.downloadPlugin') }}
        </a>
        <div
          class="mt-6 flex flex-wrap items-center gap-5 border-t border-line pt-4 text-xs text-muted"
        >
          <NuxtLink
            to="/setup"
            class="inline-flex min-h-8 items-center gap-1.5"
          >
            <BookOpen
              class="size-3.5"
              aria-hidden="true"
            />
            {{ $t('kicad.setup.guide') }}
          </NuxtLink>
        </div>
      </section>
    </div>
  </dialog>
</template>
