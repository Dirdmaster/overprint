import react from './ReactPart.jsx?raw'
import vue from './OverprintPart.client.vue?raw'
import javascript from './vanilla.js?raw'

export const frameworkSource = (framework, part, options, preview) => {
  const props = JSON.stringify(options, null, 2)
  if (framework === 'javascript') return { language: 'javascript', code: `${javascript}\n\nconst mounted = mountPart(host, board, '${part}', ${props}, ${preview})\n// On teardown: mounted.destroy()` }
  if (framework === 'react' || framework === 'next') return { language: 'jsx', code: `${react}\n\n// Usage${framework === 'next' ? ' from an App Router page; board must be serializable' : ''}:\n<OverprintPart board={board} part="${part}" options={${props}} preview={${preview}} />` }
  return { language: 'html', code: `<!-- ${framework === 'nuxt' ? 'app/components/OverprintPart.client.vue' : 'OverprintPart.vue'} -->\n${vue}\n\n<!-- Usage in a parent template (import OverprintPart in Vue; Nuxt auto-imports it): -->\n<OverprintPart :board="board" part="${part}" :options='${props}' :preview="${preview}" />` }
}
