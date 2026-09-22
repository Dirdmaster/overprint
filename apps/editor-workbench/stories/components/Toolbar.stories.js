import { componentStory } from './story'
const meta = componentStory('toolbar', { tools: ['select', 'hand', 'paint'], orientation: 'vertical', showShortcuts: true }, { tools: { control: 'inline-check', options: ['select', 'hand', 'paint'] }, orientation: { control: 'inline-radio', options: ['vertical', 'horizontal'] }, showShortcuts: { control: 'boolean' } }, false)
export default { title: 'Components/Toolbar', ...meta }
export const Default = {}
