<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
const { t } = useI18n()
const { theme, toggle } = useTheme()
const label = computed(() =>
  t(theme.value === 'dark' ? 'common.theme.switchToLight' : 'common.theme.switchToDark')
)
</script>

<template>
  <button
    class="icon-button"
    :aria-label="label"
    :title="t('common.theme.shortcut', { action: label })"
    aria-keyshortcuts="Meta+D Control+D"
    @click="toggle"
  >
    <Sun
      v-if="theme === 'dark'"
      class="size-4.5"
      aria-hidden="true"
    />
    <Moon
      v-else
      class="size-4.5"
      aria-hidden="true"
    />
  </button>
</template>
