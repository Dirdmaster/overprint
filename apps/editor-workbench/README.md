# Editor workbench

Storybook runs the built `@overprint/editor` package with a real board. React and Next use the React adapter; Vue and Nuxt use the Vue adapter. The framework toolbar updates both the live preview and its consumer code.

```sh
bun run --cwd packages/editor build
bun run --cwd apps/editor-workbench storybook
```

The default fixture is the owner-approved public LoRa development card snapshot in `fixtures/loracard.json`; see its provenance and limits in `fixtures/README.md`. Its raw KiCad file exceeds the current browser parser bound; the pre-extracted host snapshot works.

For local testing, set `OVERPRINT_BOARD_FIXTURE=/absolute/path/board.json` to use another BoardPackage snapshot. Static Storybook output embeds the selected board geometry and artwork. Do not publish a build made with a private override.

- **Getting started:** package setup, props, events and session ownership.
- **Editor / Playground:** full editor, with theme, side and grid controls.
- **Components:** one entry per part with its own props.
- **Integration:** host save/restore, local file import and geometry refresh.
- **Customization:** rearranged parts and custom controls using shared context.

Framework examples import packaged components, not local lifecycle wrappers. Recipes and customization source come from the same modules mounted by their preview. Component source shows a small typed consumer component with the selected props. Plain JavaScript retains explicit lifecycle setup.

The host owns persistence; save/restore recipes use memory. Rebuild the package after editor changes. Storybook is browser-only; Next/Nuxt SSR, hydration and package-resolution checks belong in separate consumer applications. History and independent-instance regression checks live in `packages/editor/tests` rather than extra editor stories.
