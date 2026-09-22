export default {
  globalTypes: {
    framework: {
      description: 'Framework used by component previews and code examples',
      toolbar: {
        title: 'Framework',
        icon: 'component',
        dynamicTitle: true,
        items: [
          { value: 'react', title: 'React' },
          { value: 'vue', title: 'Vue' },
          { value: 'next', title: 'Next.js' },
          { value: 'nuxt', title: 'Nuxt' },
          { value: 'javascript', title: 'JavaScript' },
        ],
      },
    },
  },
  initialGlobals: { framework: 'next' },
  parameters: { layout: 'fullscreen', docs: { codePanel: true, source: { type: 'code' } } },
}
