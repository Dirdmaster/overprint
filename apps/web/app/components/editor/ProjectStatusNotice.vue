<script setup lang="ts">
defineProps<{ message: string }>()
defineEmits<{ dismiss: [] }>()
</script>

<template>
  <p
    v-if="message"
    role="status"
    class="mx-auto my-2 max-w-sm shrink-0 rounded-lg bg-surface/95 px-3 py-2 text-center text-xs shadow-lg"
    @click="$emit('dismiss')"
  >
    {{ message }}
  </p>
</template>
