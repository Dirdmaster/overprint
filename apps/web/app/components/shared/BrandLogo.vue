<script setup lang="ts">
defineProps<{ maker?: boolean }>()
</script>

<template>
  <span
    class="block"
    :aria-label="maker ? 'Weavers' : 'Overprint'"
    role="img"
  >
    <img
      class="logo-light size-full object-contain"
      :src="maker ? '/brand/weavers-on-light.svg' : '/brand/overprint-light.svg'"
      alt=""
    />
    <img
      class="logo-dark size-full object-contain"
      :src="maker ? '/brand/weavers-on-dark.svg' : '/brand/overprint-dark.svg'"
      alt=""
    />
  </span>
</template>
