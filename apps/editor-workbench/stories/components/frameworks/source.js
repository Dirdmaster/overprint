import javascript from './vanilla.js?raw'
const componentName = (part) =>
  part
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('')
export const frameworkSource = (framework, part, options, preview) => {
  if (framework === 'javascript')
    return {
      language: 'javascript',
      code: `${javascript}\n\nconst mounted = mountPart(host, board, '${part}', ${JSON.stringify(options, null, 2)}, ${preview})\n// On teardown: mounted.destroy()`
    }
  const name = componentName(part)
  const names = part === 'editor' ? 'Editor' : `EditorRoot, ${name}${preview ? ', Canvas' : ''}`
  const entries = Object.entries(options)
  if (framework === 'react' || framework === 'next') {
    const props = entries.map(([key, value]) => `${key}={${JSON.stringify(value)}}`).join(' ')
    const content =
      part === 'editor'
        ? `<Editor board={board} ${props} />`
        : `<EditorRoot board={board}>\n      <${name} ${props} />${preview ? '\n      <Canvas />' : ''}\n    </EditorRoot>`
    return {
      language: 'tsx',
      code: `import { ${names} } from '@overprint/editor/react'\nimport type { BoardPackage } from '@overprint/editor'\n\nexport default function BoardView({ board }: { board: BoardPackage }) {\n  return (\n    ${content}\n  )\n}`
    }
  }
  const props = entries
    .map(([key, value]) =>
      typeof value === 'string' ? `${key}="${value}"` : `:${key}='${JSON.stringify(value)}'`
    )
    .join(' ')
  const content =
    part === 'editor'
      ? `<Editor :board="board" ${props} />`
      : `<EditorRoot :board="board">\n    <${name} ${props} />${preview ? '\n    <Canvas />' : ''}\n  </EditorRoot>`
  return {
    language: 'html',
    code: `<script setup lang="ts">\nimport { ${names} } from '@overprint/editor/vue'\nimport type { BoardPackage } from '@overprint/editor'\ndefineProps<{ board: BoardPackage }>()\n</script>\n\n<template>\n  ${content}\n</template>`
  }
}
