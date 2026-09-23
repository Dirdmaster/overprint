import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwind from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [tailwind(), vue({ customElement: true }), { name: 'react-client-boundary', renderChunk(code, chunk) { if (chunk.name === 'react') return { code: '"use client";\n' + code, map: null } } }],
  resolve: { alias: { '~': fileURLToPath(new URL('../../apps/web/app', import.meta.url)) } },
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  worker: { format: 'es' },
  build: { lib: { entry: { editor: 'src/index.ts', react: 'src/react.ts' }, formats: ['es'], fileName: (_format, name) => `${name}.js` }, rollupOptions: { external: ['react'] } },
})
