import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export default {
  stories: ['../stories/**/*.stories.js', '../stories/*.mdx'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/html-vite',
  core: { disableTelemetry: true },
  features: { sidebarOnboardingChecklist: false },
  viteFinal(config) {
    const fixture = process.env.OVERPRINT_BOARD_FIXTURE || fileURLToPath(new URL('../fixtures/loracard.json', import.meta.url))
    const board = JSON.parse(readFileSync(resolve(fixture), 'utf8'))
    config.plugins ||= []
    config.plugins.push(vue({ template: { compilerOptions: { isCustomElement: tag => tag.startsWith('overprint-') } } }))
    config.plugins.push({
      name: 'overprint-host-board',
      resolveId: id => id === 'virtual:overprint-board' ? '\0overprint-host-board' : undefined,
      load: id => id === '\0overprint-host-board' ? `export default ${JSON.stringify(board)}` : undefined,
    })
    return config
  },
}
