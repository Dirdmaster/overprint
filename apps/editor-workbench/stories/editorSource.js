import react from './examples/next-editor.jsx?raw'
import vue from './examples/OverprintEditor.client.vue?raw'
import javascript from './examples/save-restore.js?raw'
import { frameworkSource } from './components/frameworks/source'

export const editorSource = (framework, mode) => {
  if (mode !== 'save') return frameworkSource(framework, 'editor', {}, false)
  if (framework === 'vue' || framework === 'nuxt') return {
    language: 'html',
    code: `<!-- ${framework === 'nuxt' ? 'app/components/OverprintEditor.client.vue' : 'OverprintEditor.vue'} -->\n${vue}\n\n<!-- Parent template: pass your BoardPackage as board. -->\n<OverprintEditor :board="board" />`,
  }
  if (framework === 'react' || framework === 'next') return {
    language: 'jsx',
    code: `${react}\n\n// Parent component: pass your BoardPackage as board.\n<NextEditor board={board} />`,
  }
  return { language: 'javascript', code: javascript }
}
