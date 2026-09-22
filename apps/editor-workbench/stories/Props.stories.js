import { makeBoard } from './fixture'
import { mountConfiguredEditor } from './examples/props'
import code from './examples/props.js?raw'
import composition from './examples/composed.js?raw'
let current
export default {
  title: 'Customization/Component props',
  args: {
    tools: ['select', 'hand', 'paint'],
    orientation: 'horizontal',
    showShortcuts: true,
    presets: [{ name: 'Violet', color: '#7700ff' }, { name: 'Coral', color: '#ff6655' }, { name: 'White', color: '#ffffff' }],
    customColors: true,
    showPaintTarget: true,
    showImport: true,
    showNativeLayers: true,
    showViewMode: true,
    showBoardSide: true,
    grid: true,
  },
  argTypes: {
    tools: { control: 'inline-check', options: ['select', 'hand', 'paint'] },
    orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] },
    presets: { control: 'object' },
    ...Object.fromEntries(['showShortcuts', 'customColors', 'showPaintTarget', 'showImport', 'showNativeLayers', 'showViewMode', 'showBoardSide', 'grid'].map(name => [name, { control: 'boolean' }])),
  },
  parameters: { docs: { source: { code: `${code}\n\n// composed.js\n${composition}`, language: 'javascript' } } },
  beforeEach: () => () => { current?.editor.destroy(); current = undefined },
  render: args => {
    if (!current) {
      const root = document.createElement('div')
      root.className = 'props-example'
      current = { root, editor: mountConfiguredEditor(root, makeBoard(), args) }
    } else current.editor.update(args)
    return current.root
  },
}
export const Playground = {}
