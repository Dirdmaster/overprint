# @overprint/editor

The Overprint editor as a framework-independent web component. It uses the same editor components and state model as the standalone app, including SVG artwork, layers and folders, transforms and alignment, native silkscreen Live Paint, board colors, front/back controls, and optional 3D geometry.

## React and Next.js

```tsx
import { Editor } from '@overprint/editor/react'

<Editor board={board} theme="dark" />
```

The package owns registration, mounting and cleanup. No stylesheet import is required; the default editor height is built in and can be overridden with `--overprint-height` on the component's `style`. Next can import the component from a server page with serializable board data. Use a client parent for callbacks or hooks.

`onReady(controller)`, `onChange(document)` and `onError(error)` connect host behavior. `onChange` creates a detached document snapshot only when supplied. Pass stable board data: a new board object starts a new session and clears artwork/history. Presentation props update the existing session. Use controller `replaceBoard` for geometry refresh without losing artwork.

For custom layouts, wrap named parts in `EditorRoot board={board}`: `Canvas`, `Toolbar`, `Palette`, `Layers`, `Properties`, `ViewControls`, `ZoomControls`. One root supports one canvas. Children render after the session is ready. Custom controls use `useEditor()` for actions and `useEditorState()` for reactive state; both must be inside the root. Theme flows from the root and can be overridden per part. Parts accept presentation props directly.

## Vue and Nuxt

```vue
<script setup lang="ts">
import { Editor } from '@overprint/editor/vue'
import type { BoardPackage } from '@overprint/editor'
defineProps<{ board: BoardPackage }>()
</script>

<template>
  <Editor :board="board" theme="dark" />
</template>
```

The Vue entry is safe to import and render on the server, including in Nuxt. It initializes after mounting; no copied `.client.vue` wrapper or `ClientOnly` is needed. Events are `@ready`, `@change` and `@error`. Named parts and `EditorRoot` match the React entry. In a child of the root, `useEditor()` returns the controller and `useEditorState()` returns a readonly reactive snapshot ref. Browser children appear after initialization.

## Plain JavaScript

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

The host supplies a `BoardPackage` and owns storage, authentication, and exports. `getDocument()` returns a detached, JSON-serializable Overprint composition. `await editor.restore(document)` validates and restores it, clearing undo history. It returns `true` when applied or `false` if disposal or a newer board operation cancels it; invalid documents still reject. Subscribe notifications signal document changes; call `getDocument()` when a snapshot is needed.

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

### Presentation props

The React and Vue components accept presentation props directly, for example `<Toolbar orientation="horizontal" showShortcuts={false} />` in React or `<Toolbar orientation="horizontal" :show-shortcuts="false" />` in Vue. No DOM refs or compiler configuration are needed.

For advanced custom-element integrations, all elements accept reactive presentation properties. Set arrays and booleans as DOM properties (or Vue `.prop` bindings), not JSON strings in attributes. Changes apply without remounting the controller or clearing artwork. The full `overprint-editor` accepts the same props for its built-in parts.

| Part | Props (defaults) |
| --- | --- |
| Toolbar | `tools` (`['select', 'hand', 'paint']`), `orientation` (`'vertical'`), `showShortcuts` (`true`) |
| Palette | `presets` (standard swatches), `customColors` (`true`), `showPaintTarget` (`true`) |
| Layers | `showImport` (`true`), `showNativeLayers` (`true`) |
| View controls | `showViewMode` (`true`), `showBoardSide` (`true`) |
| Canvas | `grid` (`true`) |

```vue
<overprint-toolbar
  :controller.prop="controller"
  :tools.prop="['select', 'paint']"
  orientation="horizontal"
  :show-shortcuts.prop="false"
/>
<overprint-palette
  :controller.prop="controller"
  :presets.prop="[{ name: 'Violet', color: '#7700ff' }]"
  :custom-colors.prop="false"
/>
```

Only when using custom elements directly, configure Vue to recognize `overprint-*` tags, or assign properties through a React element ref. Prefer the packaged framework components above. Plain JavaScript is typed through `HTMLElementTagNameMap`:

```ts
const toolbar = document.createElement('overprint-toolbar')
toolbar.controller = controller
toolbar.tools = ['select', 'paint']
toolbar.orientation = 'horizontal'
toolbar.showShortcuts = false
```

`EditorPresentation` and `EditorElement` are exported types. These props configure presentation, not permissions: hiding an action does not disable its keyboard shortcut or controller method. Custom `presets` change the displayed palette choices; canvas color-cycling shortcuts still use the standard palette. Color values should be six-digit hex strings. CSS tokens and `::part` remain available for visual styling.

## In-memory checkpoints

Inside an `EditorRoot`, `useEditorHistory()` from the React or Vue entry returns `checkpoint()`, `restore()`, `canRestore`, `pending`, and `error`. Vue exposes the three state values as readonly refs; React exposes reactive values. Multiple controls under the same root share one checkpoint. Use `EditorSurface` to put the complete editor UI under that root alongside your own controls, without creating another session.

`checkpoint()` returns whether a detached document was captured. `restore()` returns a promise of whether restoration succeeded. Both report failures through `error` (a message or `null`), so button handlers need no repeated try/catch. A restore without a checkpoint returns `false`. Concurrent restores share the same promise; checkpointing during a restore returns `false`. `canRestore` is false while restoring. A failed or cancelled operation reports an error and retains the previous checkpoint for retry. Successful operations clear the error.

Plain JavaScript uses `createEditorHistory(controller)`. Its `getState()` returns an immutable snapshot; `subscribe(listener)` returns an unsubscribe function. React and Vue handle subscriptions automatically. The helper does not create or destroy the controller.

This is one checkpoint in memory, separate from undo/redo. A new controller starts empty; loading a different board into the same controller keeps the checkpoint available, including its original board. Nothing is written to disk or sent to a server. Use `getDocument()` and `restore(document)` when your host needs persistent storage.
