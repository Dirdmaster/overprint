import { componentStory } from './story'
const meta = componentStory('view-controls', { showViewMode: true, showBoardSide: true }, { showViewMode: { control: 'boolean' }, showBoardSide: { control: 'boolean' } }, true)
export default { title: 'Components/View Controls', ...meta }
export const Default = {}
