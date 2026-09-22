# Editor workbench

Storybook mounts the built `@overprint/editor` package, including the application's real tools, layer tree, Live Paint, board properties, and alignment controls. React, Vue, and plain JavaScript stories all consume the same Web Component API. The examples in `stories/mount.js` show framework lifecycles; `stories/scenarios.js` shows host save, restore, board replacement, and local PCB import.

Supply a real board snapshot as an absolute path. Board fixtures are intentionally outside the package and are not committed with this workbench.

```sh
bun run --cwd packages/editor build
OVERPRINT_BOARD_FIXTURE=/absolute/path/board.json bun run --cwd apps/editor-workbench storybook
```

The same environment variable is required for the static `build:storybook` command. A static Storybook build includes that board's geometry, so review the fixture before publishing the build. This repository's LoRa development card snapshot is local only. Its dense raw KiCad source exceeds the current browser parser limit; the host-provided snapshot works in the full editor.

The host owns persistence. These stories save into memory and display a compact document summary. They do not imply a server save. Changes to the editor require rebuilding `packages/editor` before refreshing Storybook.

Open **Frameworks → Docs** for setup and copyable framework integration code, or open the **Code** panel on a live story. Framework snippets are imported directly from the modules used to mount those stories, so the displayed code stays in sync with the running example.

**Frameworks → Next.js** demonstrates an App Router client component and a server page. The server passes serializable board data; the client imports the editor after hydration and releases it on unmount. The live story exercises the same component in React Strict Mode. The example was also production-built locally with Next.js 16.3.6 against the editor tarball. Its save/restore buttons use host memory, not a persistence backend.

**Frameworks → Nuxt** includes a typed `OverprintEditor.client.vue` and Nuxt 4 page setup, plus Nuxt 3 directory guidance. The story runs the same component through Vue; a separate local Nuxt 4.5.2 production build and typecheck validated the page integration against the editor tarball. Save/restore uses host memory.

### Component framework selector

The **Components** section has one story per component. Choose React, Vue, Next.js, Nuxt, or JavaScript from the global toolbar. The selection persists between component stories and updates both the mounted integration and the Code panel. Controls remain specific to the component. Switching frameworks starts a fresh example session; changing component props keeps the current session.

Full-editor scenarios and framework-specific integration guides keep their declared implementation and lock the framework selector accordingly.
