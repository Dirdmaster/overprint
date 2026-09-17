<script setup lang="ts">
const repositoryUrl = 'https://overprint.ink/pcm/repository.json'
const copied = ref(false)
const failed = ref(false)
const copy = async () => {
  try {
    await navigator.clipboard.writeText(repositoryUrl)
    copied.value = true
    failed.value = false
  } catch {
    failed.value = true
  }
}
</script>

<template>
  <div class="mt-4 space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <input
        :value="repositoryUrl"
        :aria-label="$t('kicad.setup.repositoryUrl')"
        readonly
        class="min-w-0 flex-1 rounded-lg border border-line bg-soft px-3 py-2 text-sm"
        @focus="($event.target as HTMLInputElement).select()"
      />
      <button
        class="primary-button"
        type="button"
        @click="copy"
      >
        {{ $t(copied ? 'kicad.setup.copied' : 'kicad.setup.copyUrl') }}
      </button>
    </div>
    <p
      v-if="failed"
      role="status"
      class="text-xs text-muted"
    >
      {{ $t('kicad.setup.copyFallback') }}
    </p>
  </div>
</template>
