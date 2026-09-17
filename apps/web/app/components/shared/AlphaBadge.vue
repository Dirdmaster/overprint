<script setup lang="ts">
const { theme } = useTheme()
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center rounded-md px-3 py-2 font-geist text-base font-semibold leading-none"
    :class="theme === 'dark' ? 'bg-white text-weavers' : 'bg-weavers text-white'"
  >
    {{ $t('common.alpha') }}
  </span>
</template>
