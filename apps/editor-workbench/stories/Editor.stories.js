import { componentStory } from './components/story'
export default {
  title: 'Editor',
  ...componentStory(
    'editor',
    { theme: 'light', side: 'front', grid: true },
    {
      theme: { control: 'inline-radio', options: ['light', 'dark', 'system'] },
      side: { control: 'inline-radio', options: ['front', 'back'] },
      grid: { control: 'boolean' }
    }
  )
}
export const Playground = {}
