import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwind from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [tailwind(), vue({ customElement: true })],
  resolve: { alias: { '~': fileURLToPath(new URL('../../apps/web/app', import.meta.url)) } },
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  worker: { format: 'es' },
  build: { lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'editor.js' } },
})
