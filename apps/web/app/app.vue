<script setup lang="ts">
useThemeRuntime()
const { locale, t } = useI18n()
useSeoMeta({
  description: () => t('common.seo.description'),
  ogTitle: () => t('common.seo.title'),
  ogDescription: () => t('common.seo.description'),
  ogType: 'website',
  ogSiteName: 'Overprint',
  ogUrl: 'https://overprint.ink/',
  ogImage: 'https://overprint.ink/brand/social-card.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageType: 'image/png',
  ogImageAlt: () => t('common.seo.imageAlt'),
  twitterCard: 'summary_large_image',
  twitterTitle: () => t('common.seo.title'),
  twitterDescription: () => t('common.seo.description'),
  twitterImage: 'https://overprint.ink/brand/social-card.png',
  twitterImageAlt: () => t('common.seo.imageAlt')
})
useHead({ htmlAttrs: { lang: locale } })
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
