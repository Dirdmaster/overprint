import { componentStory } from './story'
const meta = componentStory('canvas', { grid: true }, { grid: { control: 'boolean' } }, false)
export default { title: 'Components/Canvas', ...meta }
export const Default = {}
