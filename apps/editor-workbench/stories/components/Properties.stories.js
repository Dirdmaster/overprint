import { componentStory } from './story'
import { frameworkSource } from './frameworks/source'
const meta = componentStory('properties', {}, {}, false)
export default { title: 'Components/Properties', ...meta }
const example = framework => ({ parameters: { componentFramework: framework, docs: { source: frameworkSource(framework, 'properties', meta.args, false) } } })
export const React = { name: 'React', ...example('react') }
export const Vue = { name: 'Vue', ...example('vue') }
export const NextJs = { name: 'Next.js', ...example('next') }
export const Nuxt = { name: 'Nuxt', ...example('nuxt') }
export const JavaScript = { name: 'JavaScript', ...example('javascript') }
