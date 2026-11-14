<script setup lang="ts">
import type { PanelSummary } from '~/utils/panel/panelStore'

defineProps<{ savedPanels: PanelSummary[]; savedPanelId: string; title: string }>()
const panelName = defineModel<string>({ required: true })
const emit = defineEmits<{ open: [id: string]; newPanel: [] }>()
</script>

<template>
  <label
    v-if="savedPanels.length"
    class="grid gap-1 text-sm"
  >
    {{ $t('panel.openSaved') }}
    <select
      :aria-label="$t('panel.openSaved')"
      :value="savedPanelId"
      class="rounded-md border border-line bg-surface p-2"
      @change="emit('open', ($event.target as HTMLSelectElement).value)"
    >
      <option
        value=""
        disabled
      >
        {{ $t('panel.chooseSaved') }}
      </option>
      <option
        v-for="panel in savedPanels"
        :key="panel.id"
        :value="panel.id"
      >
        {{ panel.name }}
      </option>
    </select>
  </label>
  <button
    v-if="savedPanelId"
    type="button"
    class="header-action"
    @click="emit('newPanel')"
  >
    {{ $t('panel.new') }}
  </button>
  <label class="grid gap-1 text-sm">
    {{ $t('panel.name') }}
    <input
      v-model="panelName"
      class="rounded-md border border-line p-2"
      :placeholder="title"
      maxlength="200"
    />
  </label>
</template>
