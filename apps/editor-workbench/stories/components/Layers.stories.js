import { componentStory } from './story'
export default { title: 'Components/Layers', ...componentStory('layers', { showImport: true, showNativeLayers: true }, { showImport: { control: 'boolean' }, showNativeLayers: { control: 'boolean' } }, false) }
export const Default = {}
