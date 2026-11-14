<script setup lang="ts">
import { svgImageUrl } from '../../utils/svgImage'

defineProps<{ sources: { side: string; source: string }[]; name: string }>()
</script>

<template>
  <div
    class="library-preview grid h-full min-h-0 place-items-center gap-2 p-4"
    :class="sources.length > 1 ? 'grid-cols-2' : 'grid-cols-1'"
  >
    <figure
      v-for="image in sources"
      :key="image.side"
      class="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2"
    >
      <img
        :src="svgImageUrl(image.source)"
        :alt="`${name} ${image.side} preview`"
        class="min-h-0 w-full flex-1 object-contain"
      />
      <figcaption
        v-if="sources.length > 1"
        class="rounded bg-black/40 px-2 py-0.5 text-xs text-white"
      >
        {{ image.side === 'front' ? 'Front' : 'Back' }}
      </figcaption>
    </figure>
  </div>
</template>

<style scoped>
.library-preview {
  background-color: #62665e;
  background-image:
    linear-gradient(45deg, #ffffff08 25%, transparent 25%, transparent 75%, #ffffff08 75%),
    linear-gradient(45deg, #ffffff08 25%, transparent 25%, transparent 75%, #ffffff08 75%);
  background-size: 1rem 1rem;
  background-position:
    0 0,
    0.5rem 0.5rem;
}
</style>
