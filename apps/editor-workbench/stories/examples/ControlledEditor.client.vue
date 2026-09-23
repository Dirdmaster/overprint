<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { EditorController } from '@overprint/editor'
// The client host owns the controller and its save/restore lifecycle.
defineProps<{ controller: EditorController }>()
const ready = ref(false)
const error = ref('')
let disposed = false
onBeforeUnmount(() => { disposed = true })
onMounted(async () => {
  try {
    const { registerEditor } = await import('@overprint/editor')
    if (disposed) return
    registerEditor()
    ready.value = true
  } catch (value) {
    if (!disposed) error.value = value instanceof Error ? value.message : 'Unable to mount editor'
  }
})
</script>
<template>
  <overprint-editor v-if="ready" :controller.prop="controller" />
  <p v-if="error" role="alert">{{ error }}</p>
</template>
