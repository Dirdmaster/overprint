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
export const React = { args: { framework: 'react' } }
export const Vue = { args: { framework: 'vue' } }
export const PlainJavaScript = { name: 'Plain JavaScript', args: { framework: 'vanilla' } }
