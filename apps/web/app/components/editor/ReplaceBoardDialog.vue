<script setup lang="ts">
import { Download } from '@lucide/vue'
defineEmits<{ save: [] }>()
const dialog = useTemplateRef('dialog')
const allowUpdate = ref(false)
let resolve: ((accepted: boolean | 'update') => void) | undefined
let returnFocus: HTMLElement | undefined
const finish = (accepted: boolean | 'update' = false) => {
  const pending = resolve
  if (!pending) return
  resolve = undefined
  dialog.value?.close()
  returnFocus?.focus()
  pending(accepted)
}
const show = (update = false) => {
  if (resolve) return Promise.resolve(false)
  allowUpdate.value = update
  returnFocus = document.activeElement as HTMLElement
  return new Promise<boolean | 'update'>((done) => {
    resolve = done
    dialog.value?.showModal()
  })
}
onBeforeUnmount(() => finish())
defineExpose({ show })
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="replace-board-title"
    aria-describedby="replace-board-description"
    class="m-auto w-md max-w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-5 text-ink shadow-xl"
    @cancel.prevent="finish()"
    @close="finish()"
  >
    <h2
      id="replace-board-title"
      class="font-semibold"
    >
      {{ $t('editor.replaceBoard.title') }}
    </h2>
    <p
      id="replace-board-description"
      class="mt-4 text-sm leading-relaxed text-muted"
    >
      {{
        $t(
          allowUpdate ? 'editor.replaceBoard.updateDescription' : 'editor.replaceBoard.description'
        )
      }}
    </p>
    <div class="mt-6 flex flex-wrap justify-end gap-2">
      <button
        class="header-action"
        @click="$emit('save')"
      >
        <Download />
        {{ $t('common.saveProject') }}
      </button>
      <button
        class="header-action"
        autofocus
        @click="finish()"
      >
        {{ $t('editor.replaceBoard.cancel') }}
      </button>
      <button
        v-if="allowUpdate"
        class="header-action"
        @click="finish('update')"
      >
        {{ $t('editor.replaceBoard.update') }}
      </button>
      <button
        class="primary-button"
        @click="finish(true)"
      >
        {{ $t('editor.replaceBoard.open') }}
      </button>
    </div>
  </dialog>
</template>
