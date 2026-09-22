<!-- app/pages/index.vue (Nuxt 4) -->
<script setup lang="ts">
import type { BoardPackage } from '@overprint/editor'
import boardData from '~/data/board.json'
const board = boardData as BoardPackage
</script>

<template>
  <!-- Auto-imported from app/components/OverprintEditor.client.vue. -->
  <ClientOnly>
    <OverprintEditor :board="board" />
    <template #fallback><p>Loading editor…</p></template>
  </ClientOnly>
</template>
