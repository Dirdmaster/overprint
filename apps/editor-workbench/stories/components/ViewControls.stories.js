import { componentStory } from './story'
export default { title: 'Components/View Controls', ...componentStory('view-controls', { showViewMode: true, showBoardSide: true }, { showViewMode: { control: 'boolean' }, showBoardSide: { control: 'boolean' } }, true) }
export const Default = {}
