import { createEditor, registerEditor } from '@overprint/editor'
import { makeBoard } from '../fixture'
import './style.css'

// Each story owns one controller. Prop edits update the same mounted component.
export const componentStory = (name, args = {}, argTypes = {}, preview = false) => {
  let current
  const destroy = () => { current?.root.remove(); current?.controller.destroy(); current = undefined }
  return {
    args,
    argTypes,
    parameters: { controls: { disable: !Object.keys(args).length }, docs: { source: { language: 'javascript', code: `import { createEditor, registerEditor } from '@overprint/editor'

registerEditor()
const controller = createEditor(board) // Your BoardPackage
const component = document.createElement('overprint-${name}')
component.controller = controller
Object.assign(component, ${JSON.stringify(args, null, 2)})
host.append(component)${preview ? `
const canvas = document.createElement('overprint-canvas')
canvas.controller = controller
host.append(canvas)` : ''}

// Later: update component properties without remounting.
// On teardown: component.remove(); ${preview ? 'canvas.remove(); ' : ''}controller.destroy()` } } },
    beforeEach: () => destroy,
    render: props => {
      if (!current) {
        registerEditor()
        const controller = createEditor(makeBoard())
        const root = document.createElement('div')
        root.className = `component-story component-story-${name}`
        const element = document.createElement(`overprint-${name}`)
        element.controller = controller
        root.append(element)
        if (preview) {
          const canvas = document.createElement('overprint-canvas')
          canvas.controller = controller
          canvas.setAttribute('aria-label', 'Preview controlled by the component above')
          root.append(canvas)
        }
        current = { root, element, controller }
      }
      Object.assign(current.element, props)
      return current.root
    },
  }
}
