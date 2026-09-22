import { componentStory } from './story'
import { frameworkSource } from './frameworks/source'
const meta = componentStory('toolbar', { tools: ['select', 'hand', 'paint'], orientation: 'vertical', showShortcuts: true }, { tools: { control: 'inline-check', options: ['select', 'hand', 'paint'] }, orientation: { control: 'inline-radio', options: ['vertical', 'horizontal'] }, showShortcuts: { control: 'boolean' } }, false)
export default { title: 'Components/Toolbar', ...meta }
const example = framework => ({ parameters: { componentFramework: framework, docs: { source: frameworkSource(framework, 'toolbar', meta.args, false) } } })
export const React = { name: 'React', ...example('react') }
export const Vue = { name: 'Vue', ...example('vue') }
export const NextJs = { name: 'Next.js', ...example('next') }
export const Nuxt = { name: 'Nuxt', ...example('nuxt') }
export const JavaScript = { name: 'JavaScript', ...example('javascript') }
