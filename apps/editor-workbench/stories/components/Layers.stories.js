import { componentStory } from './story'
const meta = componentStory('layers', { showImport: true, showNativeLayers: true }, { showImport: { control: 'boolean' }, showNativeLayers: { control: 'boolean' } }, false)
export default { title: 'Components/Layers', ...meta }
export const Default = {}
