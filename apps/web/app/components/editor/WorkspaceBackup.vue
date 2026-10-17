<script setup lang="ts">
import {
  exportWorkspaceBackup,
  prepareWorkspaceRestore,
  restoreWorkspaceBackup,
  type PreparedWorkspaceBackup
} from '~/utils/workspaceBackup'
const props = defineProps<{ flush: () => Promise<boolean> }>()
const emit = defineEmits<{ restored: [] }>()
const busy = ref(false)
const error = ref('')
const notice = ref('')
const pending = shallowRef<PreparedWorkspaceBackup>()
const report = (cause: unknown) => {
  error.value =
    cause instanceof Error
      ? cause.message
      : 'Local storage failed. Your existing projects are unchanged.'
}
const download = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    if (!(await props.flush()))
      throw new Error('Save your recovery copy before exporting the workspace.')
    const text = await exportWorkspaceBackup()
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'overprint-workspace.overprint-backup'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) {
    report(cause)
  } finally {
    busy.value = false
  }
}
const choose = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  pending.value = undefined
  try {
    pending.value = await prepareWorkspaceRestore(file)
  } catch (cause) {
    report(cause)
  } finally {
    busy.value = false
  }
}
const restore = async () => {
  if (!pending.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (!(await props.flush()))
      throw new Error('Save your recovery copy before restoring a backup.')
    await restoreWorkspaceBackup(pending.value)
    pending.value = undefined
    notice.value = 'Backup imported as copies. Existing work was kept.'
    emit('restored')
  } catch (cause) {
    report(cause)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section
    aria-label="Workspace backup"
    class="mt-5 border-t border-line pt-4"
  >
    <h3 class="font-medium">Workspace backup</h3>
    <p class="mt-1 text-sm text-muted">
      Projects and libraries stay in this browser. Clearing site data removes them. Export a backup
      to move devices or keep a separate copy.
    </p>
    <div class="mt-3 flex flex-wrap items-center gap-3">
      <button
        class="header-action"
        :disabled="busy"
        @click="download"
      >
        Export everything
      </button>
      <label class="text-sm">
        Restore backup
        <input
          type="file"
          accept=".overprint-backup,application/json"
          aria-label="Choose workspace backup"
          class="mt-1 block max-w-full text-sm"
          :disabled="busy"
          @change="choose"
        />
      </label>
    </div>
    <div
      v-if="pending"
      class="mt-3 text-sm"
    >
      <p>
        {{ pending.projects.length }}
        {{ pending.projects.length === 1 ? 'project' : 'projects' }} and
        {{ pending.libraries.length }} library compositions
      </p>
      <p>Import as new copies. Current projects and libraries will be retained.</p>
      <button
        class="header-action mt-2"
        :disabled="busy"
        @click="restore"
      >
        Import backup copies
      </button>
      <button
        class="header-action"
        :disabled="busy"
        @click="pending = undefined"
      >
        Cancel restore
      </button>
    </div>
    <p
      v-if="error"
      role="alert"
      class="mt-3 text-sm"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      role="status"
      class="mt-3 text-sm"
    >
      {{ notice }}
    </p>
  </section>
</template>
