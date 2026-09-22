import reactCode from './examples/react.js?raw'
import vueCode from './examples/vue.js?raw'
import vanillaCode from './examples/vanilla.js?raw'
import { scenario } from './scenarios'
let current
export default {
  title: 'Frameworks',
  beforeEach: () => () => current?.destroy(),
  render: args => {
    current?.destroy()
    current = scenario({ ...args, mode: 'save' })
    return current.root
  },
}
export const React = { args: { framework: 'react' }, parameters: { docs: { source: { code: reactCode, language: 'javascript' } } } }
export const Vue = { args: { framework: 'vue' }, parameters: { docs: { source: { code: vueCode, language: 'javascript' } } } }
export const PlainJavaScript = { name: 'Plain JavaScript', args: { framework: 'vanilla' }, parameters: { docs: { source: { code: vanillaCode, language: 'javascript' } } } }
