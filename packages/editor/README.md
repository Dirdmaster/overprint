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

## Compose your own editor

`registerEditor()` also registers these independent parts:

| Element | Responsibility |
| --- | --- |
| `overprint-canvas` | Board rendering, artwork interaction, Live Paint, pan and zoom |
| `overprint-toolbar` | Select, hand and paint tools |
| `overprint-palette` | Paint colors and target information |
| `overprint-layers` | Artwork/folders, hierarchy, alignment, import, undo/redo and native layer visibility |
| `overprint-properties` | Board dimensions and printed background color |
| `overprint-view-controls` | Front/back and optional 2D/3D view |
| `overprint-zoom-controls` | Fit and zoom buttons |

Assign the same `controller` DOM property to each part before attaching it. The host owns layout; use normal CSS grid or flexbox around the elements. One controller supports one mounted `overprint-canvas` or full `overprint-editor`, alongside any number of control parts. Separate boards need separate controllers. Removing a part releases its view resources but keeps the controller/document available; call `destroy()` when the whole editing session ends. Reassigning the controller property rebinds a part.

```ts
const controller = createEditor(board)
for (const name of ['toolbar', 'canvas', 'layers']) {
  const part = document.createElement(`overprint-${name}`)
  Object.assign(part, { controller })
  host.append(part)
}
```

### Custom controls

`getState()` returns a detached, lightweight UI snapshot, including tool, side, view, 2D zoom, colors, visibility, editable layer metadata, selection, and undo/redo availability. `subscribeState(listener)` reports subsequent UI changes; read `getState()` for initial rendering. Its unsubscribe function removes the observer. Use `subscribe()` for document persistence instead, so tool and zoom changes do not trigger saves.

```ts
const update = () => {
  paintButton.setAttribute('aria-pressed', String(controller.getState().activeTool === 'paint'))
}
update()
const unsubscribe = controller.subscribeState(update)
paintButton.onclick = () => controller.setTool('paint')
// On host teardown: unsubscribe()
```

Custom controls can call `setTool('select' | 'hand' | 'paint')`, `setPaintColor(hex)`, `setMaskColor(hex)`, `setSide('front' | 'back')`, `setView('2d' | '3d')`, `setVisibility('silkscreen' | 'fabrication', boolean)`, `zoomBy(positiveFactor)`, and `fit()`. Three-dimensional view requires supplied component models; fit/zoom act on the mounted canvas. Colors accept three or six hex digits.

`createLayer('layer' | 'folder')` returns its ID. `selectLayer(id | null)`, `renameLayer(id, name)`, `setLayerVisibility(id, boolean)`, and `removeLayer(id)` operate on editable artwork layers, folders, or graphics. Artwork edits use the same undo/redo history as the supplied UI. Invalid tools, colors, layer IDs and zoom factors are rejected before mutation.

### Styling

Set `data-theme="light"`, `"dark"`, or `"system"` on each part. Supported inheritable custom properties are `--overprint-canvas`, `--overprint-surface`, `--overprint-soft`, `--overprint-ink`, `--overprint-muted`, `--overprint-line`, `--overprint-accent`, `--overprint-on-accent`, `--overprint-grid`, and `--overprint-font-family`. `--overprint-height` controls canvas height.

Use `::part(surface)`, `::part(canvas)`, `::part(panel)`, `::part(toolbar)`, `::part(tool-button)`, `::part(palette)`, `::part(layers)`, `::part(properties)`, `::part(view-controls)`, `::part(zoom-controls)`, and `::part(attribution)` on their corresponding elements. These supported parts avoid dependencies on internal selectors.

```css
.my-editor { --overprint-accent: #6d28d9; --overprint-on-accent: white; }
overprint-toolbar::part(toolbar) { flex-direction: row; }
overprint-layers::part(panel) { border-radius: 1rem; }
```

`state.tool` is the selected tool; `state.activeTool` also reflects temporary hand navigation while Space or the middle mouse button is held.
