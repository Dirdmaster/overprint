<script setup lang="ts">
import { RefreshCw, X, CircuitBoard, ChevronRight } from '@lucide/vue'
const props = defineProps<{ confirmReplacement: () => Promise<boolean> }>()
const dialog = useTemplateRef('dialog')
const code = ref('')
const origin = ref('')
const advanced = ref(false)
const chooseBoard = ref(false)
const inHeader = ref(false)
const {
  session,
  busy,
  error,
  progress,
  candidates,
  discover,
  connect,
  pair,
  sync,
  cancel,
  disconnect,
  isCurrentBoard,
  syncSucceeded
} = useBoardSync()
let returnFocus: HTMLElement | undefined
let generation = 0
let previousSession: typeof session.value
let opened = false
const active = (attempt: number) => attempt === generation && !!dialog.value?.open
const refresh = async () => {
  if (await sync(chooseBoard.value ? props.confirmReplacement : undefined)) {
    opened = true
    dialog.value?.close()
  }
}
const connectAndSync = async (url: string, attempt = generation) => {
  const candidate = candidates.value.find((candidate) => candidate.url === url)
  if (chooseBoard.value && candidate && isCurrentBoard(candidate)) return
  if ((await connect(url)) && active(attempt)) await refresh()
}
const search = async () => {
  const attempt = ++generation
  if ((await discover()) && active(attempt) && candidates.value.length === 1 && !chooseBoard.value)
    await connectAndSync(candidates.value[0]!.url, attempt)
}
const show = (selectBoard = false) => {
  if (busy.value) return
  inHeader.value = false
  previousSession = session.value
  opened = false
  chooseBoard.value = selectBoard
  returnFocus = document.activeElement as HTMLElement
  origin.value = window.location.origin
  error.value = ''
  advanced.value = false
  dialog.value?.showModal()
  if (!selectBoard && session.value && Date.parse(session.value.expiresAt) > Date.now())
    void refresh()
  else {
    disconnect()
    void search()
  }
}
const manualConnect = async () => {
  if (await pair(code.value)) code.value = ''
}
const close = () => {
  generation++
  cancel()
  code.value = ''
  if (chooseBoard.value && !opened) session.value = previousSession
  returnFocus?.focus()
}
const syncBusy = computed(() => inHeader.value && busy.value)
const syncError = computed(() => (inHeader.value ? error.value : ''))
const runSync = async () => {
  if (busy.value) return
  inHeader.value = true
  if (session.value && Date.parse(session.value.expiresAt) > Date.now()) {
    await sync()
    return
  }
  disconnect()
  if (!(await discover())) {
    // First-time connection still needs the board picker / manual pairing UI.
    if (!error.value.includes('cancelled')) show()
    return
  }
  const candidate = candidates.value.length === 1 ? candidates.value[0] : undefined
  if (!candidate || candidate.requiresApproval) {
    show()
    return
  }
  if (await connect(candidate.url)) await sync()
}
defineExpose({ show, disconnect, runSync, syncBusy, syncError, syncSucceeded, progress, cancel })
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="sync-title"
    class="m-auto w-md max-w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-5 text-ink shadow-xl"
    @close="close"
  >
    <header class="mb-5 flex items-center justify-between">
      <h2
        id="sync-title"
        class="font-semibold"
      >
        Sync with KiCad
      </h2>
      <button
        class="icon-button"
        aria-label="Close sync"
        @click="dialog?.close()"
      >
        <X class="size-4" />
      </button>
    </header>
    <div
      v-if="busy"
      class="space-y-4"
    >
      <p
        role="status"
        class="flex items-center gap-3 text-sm"
      >
        <RefreshCw class="size-4 animate-spin" />
        {{ progress || 'Connecting…' }}
      </p>
      <p
        v-if="!chooseBoard"
        class="text-xs text-muted"
      >
        Your artwork stays in place.
      </p>
      <div class="flex justify-end">
        <button
          class="header-action"
          @click="dialog?.close()"
        >
          Cancel
        </button>
      </div>
    </div>
    <div
      v-else-if="session"
      class="space-y-4"
    >
      <p class="text-sm">
        Connected to
        <strong>{{ session.boardName }}</strong>
      </p>
      <div class="flex justify-end gap-2">
        <button
          class="header-action"
          @click="disconnect"
        >
          Disconnect
        </button>
        <button
          class="primary-button gap-2"
          @click="refresh"
        >
          <RefreshCw class="size-3.5" />
          Sync board
        </button>
      </div>
    </div>
    <div
      v-else
      class="space-y-4"
    >
      <div
        v-if="candidates.length"
        class="space-y-2"
      >
        <p class="text-sm">Choose the board you want to open.</p>
        <button
          v-for="(candidate, index) in candidates"
          :key="candidate.url"
          class="action-row w-full bg-soft text-ink disabled:opacity-60"
          :disabled="chooseBoard && isCurrentBoard(candidate)"
          @click="connectAndSync(candidate.url)"
        >
          <CircuitBoard
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate text-left">
            <span class="block">{{ candidate.boardName || `KiCad editor ${index + 1}` }}</span>
            <span
              v-if="isCurrentBoard(candidate)"
              class="mt-1 block text-xs text-muted"
            >
              {{ $t('editor.currentBoard') }}
            </span>
            <span
              v-if="!candidate.boardName"
              class="mt-1 block whitespace-normal text-xs font-normal text-muted"
            >
              {{
                candidate.legacy
                  ? 'Restart this PCB Editor to load the updated plugin and show its board name.'
                  : `Allow ${origin} in KiCad to show this board’s name.`
              }}
            </span>
          </span>
          <ChevronRight
            v-if="!chooseBoard || !isCurrentBoard(candidate)"
            class="size-4 shrink-0"
            aria-hidden="true"
          />
        </button>
      </div>
      <p
        v-else
        class="text-sm text-muted"
      >
        Open your PCB in KiCad with the Overprint plugin installed, then scan again.
      </p>
      <div class="flex justify-end">
        <button
          class="primary-button"
          @click="search"
        >
          Scan again
        </button>
      </div>
      <details
        :open="advanced"
        @toggle="advanced = ($event.target as HTMLDetailsElement).open"
      >
        <summary class="cursor-pointer text-xs text-muted">Use a pairing code instead</summary>
        <form
          class="mt-4 space-y-4"
          @submit.prevent="manualConnect"
        >
          <p class="text-sm leading-relaxed">
            In KiCad, open
            <strong>Tools → External Plugins → Overprint Sync</strong>
            to copy its pairing code. Use this app address:
          </p>
          <input
            :value="origin"
            readonly
            aria-label="Overprint app address"
            class="w-full rounded-md border border-line bg-soft px-3 py-2 text-xs"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <label class="block text-sm">
            Pairing code
            <textarea
              v-model="code"
              autocomplete="off"
              spellcheck="false"
              class="mt-2 h-24 w-full resize-none rounded-md border border-line bg-soft p-3 font-mono text-xs"
              required
              aria-label="KiCad pairing code"
            />
          </label>
          <div class="flex justify-end">
            <button
              class="primary-button"
              :disabled="!code.trim()"
            >
              Connect
            </button>
          </div>
        </form>
      </details>
    </div>
    <p
      v-if="error"
      role="alert"
      class="mt-4 text-sm text-muted"
    >
      {{ error }}
    </p>
  </dialog>
</template>
