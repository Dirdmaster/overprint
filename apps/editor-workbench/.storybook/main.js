import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
export default {
  stories: ['../stories/*.stories.js'],
  framework: '@storybook/html-vite',
  core: { disableTelemetry: true },
  viteFinal(config) {
    // Real private board snapshots stay outside the distributable package.
    const fixture = process.env.OVERPRINT_BOARD_FIXTURE
    if (!fixture) throw new Error('Set OVERPRINT_BOARD_FIXTURE to an absolute BoardPackage JSON path. See apps/editor-workbench/README.md.')
    const board = JSON.parse(readFileSync(resolve(fixture), 'utf8'))
    config.plugins ||= []
    config.plugins.push({
      name: 'overprint-host-board',
      resolveId: id => id === 'virtual:overprint-board' ? '\0overprint-host-board' : undefined,
      load: id => id === '\0overprint-host-board' ? `export default ${JSON.stringify(board)}` : undefined,
    })
    return config
  },
}
