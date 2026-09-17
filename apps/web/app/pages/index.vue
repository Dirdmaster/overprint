<script setup lang="ts">
// Own the layout here so editor-only drop events stay with the page's dialogs.
definePageMeta({ layout: false })
const { board, openBoard } = useComposition()
const { status, open: openProjectFile, download } = useProjectStorage()
const importer = useTemplateRef('importer')
const jlcExport = useTemplateRef('jlcExport')
const syncDialog = useTemplateRef('syncDialog')
const projectPicker = useTemplateRef('projectPicker')
const replacement = useTemplateRef('replacement')
const confirmReplacement = async () => !board.value || (await replacement.value?.show()) === true
const acceptImport = (imported: Parameters<typeof openBoard>[0]) => {
  syncDialog.value?.disconnect()
  openBoard(imported)
}
const ready = ref(false)
onMounted(() => {
  ready.value = true
})

const openImport = (setup = false, trigger?: HTMLElement) => {
  importer.value?.show(setup, trigger)
}
const openProject = () => {
  projectPicker.value?.show()
}
const onDrop = (event: DragEvent) => {
  if (!event.dataTransfer?.files.length) return
  openImport()
  importer.value?.receiveFiles(event.dataTransfer.files)
}
</script>

<template>
  <NuxtLayout
    name="editor"
    :has-board="!!board"
    :inert="!ready"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <EditorHeader
      v-if="board"
      @import="openImport()"
      @save="download"
      @open-project="openProject"
      @send="jlcExport?.show()"
      :syncing="syncDialog?.syncBusy"
      :sync-succeeded="syncDialog?.syncSucceeded"
      :sync-error="syncDialog?.syncError"
      :sync-progress="syncDialog?.progress"
      @sync="syncDialog?.runSync()"
      @scan="syncDialog?.show(true)"
    />
    <header
      v-else
      class="flex items-center justify-between p-5"
    >
      <div class="flex items-center gap-3">
        <ProjectMenu
          @scan="syncDialog?.show(true)"
          @import="openImport"
          @open-project="openProject"
        />
        <AlphaBadge />
      </div>
      <ThemeToggle />
    </header>
    <main
      class="relative flex min-h-0 flex-1"
      :class="board ? '' : 'items-center justify-center px-4 pb-20 pt-20 sm:px-20 sm:pb-56'"
      :aria-label="$t('editor.label')"
    >
      <CanvasTools
        v-if="!board"
        class="absolute left-5 top-6 sm:top-24"
      />
      <BoardEditor
        v-if="board"
        :board="board"
      />
      <WelcomeActions
        v-else
        @scan="syncDialog?.show(true)"
        @import="openImport()"
        @setup="openImport(true)"
        @open-project="openProject"
      />
    </main>
    <ProjectStatusNotice
      :message="status"
      @dismiss="status = ''"
    />
    <ProjectFilePicker
      ref="projectPicker"
      @selected="openProjectFile"
    />
    <JlcExportDialog ref="jlcExport" />
    <ReplaceBoardDialog
      ref="replacement"
      @save="download"
    />
    <SyncBoardDialog
      ref="syncDialog"
      :confirm-replacement="confirmReplacement"
    />
    <ImportBoardDialog
      ref="importer"
      :confirm-replacement="confirmReplacement"
      @imported="acceptImport"
    />
  </NuxtLayout>
</template>
