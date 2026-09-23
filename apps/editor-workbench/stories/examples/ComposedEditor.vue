<script setup lang="ts">
import {
  EditorRoot,
  Canvas,
  Toolbar,
  Layers,
  Properties,
  Palette,
  ViewControls,
  ZoomControls
} from '@overprint/editor/vue'
import type { BoardPackage } from '@overprint/editor'
import CustomToolbar from './CustomToolbar.vue'
import './composed.css'
defineProps<{ board: BoardPackage; theme?: 'light' | 'dark' | 'system'; customToolbar?: boolean }>()
</script>
<template>
  <EditorRoot
    :board="board"
    :theme="theme"
  >
    <section
      class="composed-editor"
      :data-theme="theme"
    >
      <header>
        <CustomToolbar v-if="customToolbar" />
        <Toolbar
          v-else
          orientation="horizontal"
        />
        <ViewControls />
      </header>
      <Canvas />
      <aside aria-label="Board settings">
        <Layers />
        <Properties />
      </aside>
      <footer>
        <Palette />
        <ZoomControls />
      </footer>
    </section>
  </EditorRoot>
</template>
