<script setup lang="ts">
const config = useRuntimeConfig()
</script>

<template>
  <footer class="flex h-14 shrink-0 items-center justify-between px-4">
    <BrandLogo
      maker
      class="size-10"
    />
    <div class="flex h-10 items-center text-muted">
      <a
        class="flex size-10 items-center justify-center rounded-lg hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
        href="https://x.com/Dirdmaster"
        target="_blank"
        rel="noopener noreferrer"
        :title="$t('common.xProfile')"
        :aria-label="$t('common.xProfile')"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4 fill-current"
          aria-hidden="true"
        >
          <path
            d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
          />
        </svg>
      </a>
      <a
        v-if="config.public.sourceDownload"
        class="flex h-10 items-center px-2 text-xs hover:text-ink"
        href="/downloads/overprint-source.zip"
        download
        :aria-label="$t('common.downloadSource')"
      >
        {{ $t('common.source') }}
      </a>
      <a
        class="flex size-10 items-center justify-center rounded-lg hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2"
        href="https://github.com/Dirdmaster/overprint"
        target="_blank"
        rel="noopener noreferrer"
        :title="$t('common.githubRepository')"
        :aria-label="$t('common.githubRepository')"
      >
        <img
          class="size-4 dark-social"
          src="/brand/github-filled.svg"
          alt=""
        />
      </a>
    </div>
  </footer>
</template>

<style scoped>
html[data-theme='dark'] .dark-social {
  filter: brightness(2);
}
@media (prefers-color-scheme: dark) {
  html[data-theme='system'] .dark-social {
    filter: brightness(2);
  }
}
</style>
