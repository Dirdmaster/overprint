# @overprint/editor

The Overprint editor as a framework-independent web component. It uses the same editor components and state model as the standalone app, including SVG artwork, layers and folders, transforms and alignment, native silkscreen Live Paint, board colors, front/back controls, and optional 3D geometry.

```ts
import { createEditor, registerEditor, type BoardPackage } from '@overprint/editor'

registerEditor()
const editor = createEditor(board as BoardPackage, { mask: '#161616' })
const element = document.createElement('overprint-editor')
Object.assign(element, { controller: editor })
element.setAttribute('data-theme', 'dark')
element.style.setProperty('--overprint-height', '48rem')
document.querySelector('#editor')!.append(element)

const unsubscribe = editor.subscribe(() => {
  // Debounce persistence in the host as appropriate.
  const document = editor.getDocument()
})

// On teardown:
unsubscribe()
element.remove()
editor.destroy()
```

Set the `controller` DOM property before attaching the element. Each mounted editor needs its own controller. Theme accepts `light`, `dark`, or `system`. Styles live in a shadow root; the host does not need global CSS. The browser registration and mount should happen in a client lifecycle hook when using SSR.

The host supplies a `BoardPackage` and owns storage, authentication, and exports. `getDocument()` returns a detached, JSON-serializable Overprint composition. `await editor.restore(document)` validates and restores it, clearing undo history. Subscribe notifications signal document changes; call `getDocument()` when a snapshot is needed.

- `await editor.loadBoard(file)` imports `.kicad_pcb` or an Overprint board ZIP locally, resetting artwork. A newer import cancels the older import.
- `editor.replaceBoard(board)` refreshes geometry while preserving artwork and history. Coordinate bounds must match; otherwise load a new board.
- `await editor.addGraphic(svgFile)` adds sanitized SVG artwork.
- `editor.undo()`, `editor.redo()`, and `editor.setSide('front' | 'back')` expose common host actions.
- `editor.destroy()` aborts an import, releases state watchers, and unmounts the editing surface. Remove the custom element too when disposing the host view.

No board data is uploaded and no storage is accessed by this package. File size and geometry complexity guards apply to browser imports. Very dense KiCad boards may require pre-extracted host board data. A 3D preview requires models supplied in the board package. The embedded interface currently uses English. App-level onboarding, account features, manufacturing export flows, and file storage are host responsibilities.

## Local development

Run `bun run --cwd packages/editor build` and `bun run --cwd packages/editor test` from the repository root. The build bundles the canonical editor source from `apps/web` and emits runtime chunks, the import worker, and TypeScript declarations into `dist`. Publish only the packaged output after the repository's preview and approval process.

Shared app source has a local transpiler configuration in `apps/web/app/tsconfig.json`, so the library build does not read generated Nuxt project references. Application typechecking still uses the Nuxt project at `apps/web/tsconfig.json`.
