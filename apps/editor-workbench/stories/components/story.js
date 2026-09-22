import { makeBoard } from '../fixture'
import { mountFrameworkPart } from './frameworks/mount'
import './style.css'

// Component stories share one renderer but mount real React/Vue integration code.
export const componentStory = (name, args = {}, argTypes = {}, preview = false) => {
  let current
  const destroy = () => { current?.mounted.destroy(); current?.root.remove(); current = undefined }
  return {
    args,
    argTypes,
    parameters: {
      controls: { disable: !Object.keys(args).length },
    },
    beforeEach: () => destroy,
    render: (props, context) => {
      const framework = context.parameters.componentFramework
      if (current?.framework !== framework) destroy()
      if (!current) {
        const root = document.createElement('div')
        root.className = `component-story component-story-${name}`
        const mounted = mountFrameworkPart(framework, root, makeBoard(), name, props, preview)
        current = { root, mounted, framework }
      } else current.mounted.update(props)
      return current.root
    },
  }
}
