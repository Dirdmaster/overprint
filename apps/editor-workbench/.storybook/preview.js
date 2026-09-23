export default {
  globalTypes: {
    framework: {
      description: 'Framework used by component previews and code examples',

    },
  },
  initialGlobals: { framework: 'next' },
  parameters: {
    layout: 'fullscreen',
    docs: { codePanel: true, source: { type: 'code' } },
    options: { storySort: { order: ['Getting started', 'Editor', 'Components', 'Integration', 'Customization'] } },
  },
}
