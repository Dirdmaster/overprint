import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const target = process.env.OVERPRINT_BUILD_TARGET

export default defineNuxtConfig({
  compatibilityDate: '2026-09-15',
  modules: ['@nuxtjs/i18n'],
  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    locales: [{ code: 'en', language: 'en', name: 'English', files: ['en/common.json', 'en/editor.json', 'en/kicad.json', 'en/export.json'] }],
  },
  // Feature folders organize files; existing component names stay unprefixed.
  components: [{ path: '~/components', pathPrefix: false }],
  css: ['~/assets/css/main.css', '@fontsource/inter/400.css', '@fontsource/inter/500.css', '@fontsource/inter/600.css', '@fontsource/geist/600.css'],
  vite: {
    plugins: [tailwindcss()],
    // Worker-only dependencies must be ready before the first PCB drop;
    // late discovery otherwise reloads the editor and interrupts extraction.
    optimizeDeps: { include: ['clipper-lib'] },
  },
  devtools: { enabled: false },
  nitro: {
    ...(target ? { output: { dir: fileURLToPath(new URL(`./.output/${target}`, import.meta.url)) } } : {}),
    ...(target === 'cloudflare' ? {
      entry: fileURLToPath(new URL('./server/cloudflare.ts', import.meta.url)),
      cloudflare: { nodeCompat: true },
    } : {}),
  },
  runtimeConfig: {
    public: {
      sourceDownload: existsSync(new URL('./public/downloads/overprint-source.zip', import.meta.url)),
      guideScreenshots: ['settings', 'multicolor', 'open-viewer', 'viewer'].every(name => existsSync(new URL(`./public/guides/jlcpcb/${name}.png`, import.meta.url))),
    },
  },
  app: { head: { title: 'Overprint', link: [{ rel: 'icon', type: 'image/svg+xml', href: '/brand/overprint-light.svg' }], htmlAttrs: { lang: 'en' } } },
})
