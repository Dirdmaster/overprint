<script setup lang="ts">
defineProps<{ name: string; mixed: boolean }>()
const refreshConfirmed = defineModel<boolean>({ required: true })
const emit = defineEmits<{ apply: []; cancel: [] }>()
</script>

<template>
  <div class="space-y-2 rounded-md border border-line p-3">
    <p class="text-sm">
      Previewing the newer revision of {{ name }}. Check both sides before applying.
    </p>
    <label
      v-if="mixed"
      class="flex items-start gap-2 text-sm"
    >
      <input
        v-model="refreshConfirmed"
        class="mt-1"
        type="checkbox"
      />
      {{ $t('panel.confirmNewStack') }}
    </label>
    <div class="flex flex-wrap gap-2">
      <button
        class="header-action header-action-primary"
        :disabled="mixed && !refreshConfirmed"
        @click="emit('apply')"
      >
        {{ $t('panel.applyRevision') }}
      </button>
      <button
        class="header-action"
        @click="emit('cancel')"
      >
        {{ $t('panel.cancelRevision') }}
      </button>
    </div>
  </div>
</template>
