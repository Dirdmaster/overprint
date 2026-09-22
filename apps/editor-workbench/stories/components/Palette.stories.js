import { componentStory } from './story'
export default { title: 'Components/Palette', ...componentStory('palette', { presets: [{ name: 'Yellow', color: '#ffd426' }, { name: 'Pink', color: '#fc7f9e' }, { name: 'Red', color: '#e63136' }, { name: 'White', color: '#ffffff' }, { name: 'Black', color: '#202723' }, { name: 'Blue', color: '#3586e8' }], customColors: true, showPaintTarget: true }, { presets: { control: 'object' }, customColors: { control: 'boolean' }, showPaintTarget: { control: 'boolean' } }, false) }
export const Default = {}
