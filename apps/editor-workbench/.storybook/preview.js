export default {
  globalTypes: {
    framework: {
      description: 'Framework used by component previews and code examples',

    },
  },
  initialGlobals: { framework: 'next' },
  parameters: { layout: 'fullscreen', docs: { codePanel: true, source: { type: 'code' } } },
}
