import { componentStory } from './story'
export default { title: 'Components/Toolbar', ...componentStory('toolbar', { tools: ['select', 'hand', 'paint'], orientation: 'vertical', showShortcuts: true }, { tools: { control: 'inline-check', options: ['select', 'hand', 'paint'] }, orientation: { control: 'inline-radio', options: ['vertical', 'horizontal'] }, showShortcuts: { control: 'boolean' } }, false) }
export const Default = {}
