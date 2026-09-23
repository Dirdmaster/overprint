<script setup lang="ts">
import { useEditorHistory } from '@overprint/editor/vue'
const { checkpoint, restore, canRestore, pending, error } = useEditorHistory()
</script>

<template>
  <nav class="host-actions">
    <button
      :disabled="pending"
      @click="checkpoint"
    >
      Save checkpoint
    </button>
    <button
      :disabled="!canRestore"
      @click="restore"
    >
      Restore checkpoint
    </button>
  </nav>
  <p
    v-if="error"
    role="alert"
  >
    {{ error }}
  </p>
</template>
