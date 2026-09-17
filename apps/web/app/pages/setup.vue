<script setup lang="ts">
import { kicadSetupSteps } from '~/utils/kicadSetup'
</script>

<template>
  <section>
    <h1 class="mt-10 text-3xl font-semibold">{{ $t('common.kicadSetup') }}</h1>
    <p class="mt-4 text-sm text-muted">{{ $t('kicad.setup.description') }}</p>
    <PcmRepositoryLink />
    <ol class="mt-8 list-decimal space-y-6 pl-5 text-sm leading-relaxed">
      <li
        v-for="step in kicadSetupSteps"
        :key="step.id"
      >
        <h2 class="font-medium">{{ $t(step.titleKey) }}</h2>
        <p class="mt-2 text-muted">{{ $t(step.descriptionKey) }}</p>
        <img
          v-if="step.id === 'repository'"
          src="/guides/kicad/add-repository.png"
          :alt="$t('kicad.setup.screenshotAlt')"
          class="mt-4 max-w-full rounded-xl border border-line"
          loading="lazy"
        />
      </li>
    </ol>
    <p class="mt-8 text-sm text-muted">{{ $t('kicad.setup.fallback') }}</p>
    <a
      href="/downloads/overprint-kicad.zip"
      download
      class="mt-3 inline-block text-sm underline"
    >
      {{ $t('common.downloadPlugin') }}
    </a>
    <i18n-t
      keypath="kicad.setup.manualNote"
      tag="p"
      scope="global"
      class="mt-8 text-sm text-muted"
    >
      <template #manual>
        <a
          class="underline"
          href="https://docs.kicad.org/10.0/en/kicad/kicad.html#_plugin_and_content_manager"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ $t('kicad.setup.manual') }}
        </a>
      </template>
    </i18n-t>
  </section>
</template>
