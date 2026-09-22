import { componentStory } from './story'
import { frameworkSource } from './frameworks/source'
const meta = componentStory('view-controls', { showViewMode: true, showBoardSide: true }, { showViewMode: { control: 'boolean' }, showBoardSide: { control: 'boolean' } }, true)
export default { title: 'Components/View Controls', ...meta }
const example = framework => ({ parameters: { componentFramework: framework, docs: { source: frameworkSource(framework, 'view-controls', meta.args, true) } } })
export const React = { name: 'React', ...example('react') }
export const Vue = { name: 'Vue', ...example('vue') }
export const NextJs = { name: 'Next.js', ...example('next') }
export const Nuxt = { name: 'Nuxt', ...example('nuxt') }
export const JavaScript = { name: 'JavaScript', ...example('javascript') }
