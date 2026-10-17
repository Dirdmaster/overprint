<script setup lang="ts">
// Own the layout here so editor-only drop events stay with the page's dialogs.
definePageMeta({ layout: false })
const { board, openBoard } = useComposition()
const {
  initialized,
  status,
  open: openProjectFile,
  download,
  save,
  projects,
  active,
  busy,
  refresh,
  openSaved,
  rename,
  duplicate,
  remove,
  recover
} = useProjectStorage()
const gallery = useTemplateRef('gallery')
const showProjects = async () => {
  await save()
  await refresh()
  gallery.value?.show()
}
const selectProject = async (id: string) => {
  if (await openSaved(id)) {
    syncDialog.value?.disconnect()
    gallery.value?.close()
  }
}
const importer = useTemplateRef('importer')
const jlcExport = useTemplateRef('jlcExport')
const syncDialog = useTemplateRef('syncDialog')
const projectPicker = useTemplateRef('projectPicker')
const replacement = useTemplateRef('replacement')
const confirmReplacement = async () =>
  (!board.value || (await replacement.value?.show()) === true) && (await save())
let keepArtwork = false
const confirmImport = async () => {
  keepArtwork = false
  if (!board.value) return true
  const choice = await replacement.value?.show(true)
  keepArtwork = choice === 'update'
  return (choice === true || keepArtwork) && (await save())
}
const acceptImport = (imported: Parameters<typeof openBoard>[0]) => {
  syncDialog.value?.disconnect()
  if (keepArtwork) board.value = imported
  else openBoard(imported)
  keepArtwork = false
}
const ready = computed(() => initialized.value)

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
      @projects="showProjects"
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
      <div class="flex items-center gap-2">
        <button
          class="header-action"
          @click="showProjects"
        >
          Projects
        </button>
        <ThemeToggle />
      </div>
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
    <ProjectGallery
      ref="gallery"
      :projects="projects"
      :active-id="active?.id"
      :busy="busy"
      @open="selectProject"
      @rename="rename"
      @duplicate="duplicate"
      @remove="remove"
      @import="openProject"
      @new="openImport()"
    >
      <WorkspaceBackup
        :flush="save"
        @restored="refresh"
      />
    </ProjectGallery>
    <div
      v-if="
        status && !['All changes saved', 'Project opened', 'Recovery copy saved'].includes(status)
      "
      class="flex flex-wrap justify-center gap-2 p-2"
    >
      <button
        class="header-action"
        @click="download"
      >
        Download recovery project
      </button>
      <button
        class="header-action"
        @click="recover"
      >
        Save recovery copy
      </button>
    </div>
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
      :confirm-replacement="confirmImport"
      @imported="acceptImport"
    />
  </NuxtLayout>
</template>
