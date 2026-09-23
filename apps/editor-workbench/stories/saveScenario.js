import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createApp, h } from 'vue'
import ReactEditor from './examples/next-editor'
import VueEditor from './examples/OverprintEditor.client.vue'
import { mountEditor } from './examples/save-restore'
import { makeBoard } from './fixture'
import './style.css'

// Storybook setup only. The Code panel reads the mounted examples themselves.
export const saveScenario = ({ framework, theme, side }) => {
  const root = document.createElement('div')
  const board = makeBoard()
  let dispose
  if (framework === 'react' || framework === 'next') {
    const app = createRoot(root)
    app.render(createElement(ReactEditor, { board }))
    dispose = () => app.unmount()
  } else if (framework === 'vue' || framework === 'nuxt') {
    const app = createApp({ render: () => h(VueEditor, { board }) })
    app.mount(root)
    dispose = () => app.unmount()
  } else {
    const actions = document.createElement('nav')
    actions.className = 'host-actions'
    const target = document.createElement('div')
    const output = document.createElement('output')
    root.append(actions, output, target)
    const editor = mountEditor(target, board)
    const save = document.createElement('button')
    const restore = document.createElement('button')
    save.textContent = 'Save to host'
    restore.textContent = 'Restore host save'
    restore.disabled = true
    save.onclick = () => { editor.save(); restore.disabled = false; output.textContent = 'Saved in host memory' }
    restore.onclick = async () => { try { await editor.restore(); output.textContent = 'Restored from host memory' } catch (error) { output.textContent = error.message } }
    actions.append(save, restore)
    dispose = editor.destroy
  }
  const themed = new WeakSet()
  const configure = () => root.querySelectorAll('overprint-editor').forEach(element => {
    if (themed.has(element)) return
    themed.add(element)
    element.dataset.theme = theme
    element.controller.setSide(side)
  })
  configure()
  const observer = new MutationObserver(configure)
  observer.observe(root, { childList: true, subtree: true })
  return { root, destroy: () => { observer.disconnect(); dispose() } }
}
