<script setup lang="ts">
defineProps<{ message: string }>()
defineEmits<{ dismiss: [] }>()
</script>

<template>
  <p
    v-if="message"
    role="status"
    class="fixed left-1/2 top-3 z-50 max-w-sm -translate-x-1/2 rounded-lg bg-surface/95 px-3 py-2 text-center text-xs shadow-lg"
    @click="$emit('dismiss')"
  >
    {{ message }}
  </p>
</template>
