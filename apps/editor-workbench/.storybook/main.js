import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
export default {
  stories: ['../stories/**/*.stories.js', '../stories/*.mdx'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/html-vite',
  core: { disableTelemetry: true },
  features: { sidebarOnboardingChecklist: false },
  viteFinal(config) {
    // Real private board snapshots stay outside the distributable package.
    const fixture = process.env.OVERPRINT_BOARD_FIXTURE
    if (!fixture) throw new Error('Set OVERPRINT_BOARD_FIXTURE to an absolute BoardPackage JSON path. See apps/editor-workbench/README.md.')
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
