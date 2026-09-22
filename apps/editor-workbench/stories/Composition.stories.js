import { createEditor } from '@overprint/editor'
import { makeBoard } from './fixture'
import { mountComposedEditor } from './examples/composed'
import code from './examples/composed.js?raw'
import css from './examples/composed.css?raw'
let current
export default {
  globals: { framework: 'javascript' },
  title: 'Customization',
  args: { theme: 'light', customToolbar: false },
  argTypes: { theme: { control: 'inline-radio', options: ['light', 'dark'] } },
  parameters: { docs: { source: { code: `${code}\n\n// Host setup (board is your BoardPackage):\nimport { createEditor } from '@overprint/editor'\nconst controller = createEditor(board)\nconst unmount = mountComposedEditor(host, controller, { customToolbar: true })\n// On host teardown: unmount(); controller.destroy()\n\n/* composed.css */\n${css}`, language: 'javascript' } } },
  beforeEach: () => () => current?.(),
  render: args => {
    current?.()
    const controller = createEditor(makeBoard())
    const root = document.createElement('div')
    const unmount = mountComposedEditor(root, controller, args)
    current = () => { unmount(); controller.destroy() }
    return root
  },
}
export const RearrangedParts = {}
export const CustomToolbar = { args: { customToolbar: true } }
export const Dark = { args: { theme: 'dark', customToolbar: true } }
