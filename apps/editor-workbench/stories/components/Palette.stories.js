import { componentStory } from './story'
import { frameworkSource } from './frameworks/source'
const meta = componentStory('palette', { presets: [{ name: 'Yellow', color: '#ffd426' }, { name: 'Pink', color: '#fc7f9e' }, { name: 'Red', color: '#e63136' }, { name: 'White', color: '#ffffff' }, { name: 'Black', color: '#202723' }, { name: 'Blue', color: '#3586e8' }], customColors: true, showPaintTarget: true }, { presets: { control: 'object' }, customColors: { control: 'boolean' }, showPaintTarget: { control: 'boolean' } }, false)
export default { title: 'Components/Palette', ...meta }
const example = framework => ({ parameters: { componentFramework: framework, docs: { source: frameworkSource(framework, 'palette', meta.args, false) } } })
export const React = { name: 'React', ...example('react') }
export const Vue = { name: 'Vue', ...example('vue') }
export const NextJs = { name: 'Next.js', ...example('next') }
export const Nuxt = { name: 'Nuxt', ...example('nuxt') }
export const JavaScript = { name: 'JavaScript', ...example('javascript') }
