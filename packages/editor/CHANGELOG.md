# @overprint/editor

## 0.1.0

### Minor Changes

- 2c318d1: Expose composable canvas and control elements, shared controller actions and UI state subscriptions, CSS parts and theme tokens. Keep the full editor available with the same shared layer and canvas implementation.
- 2092404: Draw rectangles, rounded rectangles, ellipses and lines with editable dimensions, fill and stroke. Shapes retain editable parameters through undo and saved projects, and can explicitly convert to SVG for Live Paint.
- 2092404: Create editable multiline text using bundled Geist Regular and Bold, with millimetre size and spacing, alignment and fill. Text renders and exports as frozen local SVG outlines, survives saved projects without regeneration, and explicitly rejects unsupported characters. Text can convert to ordinary SVG before Live Paint.
- 2c318d1: Add shared in-memory checkpoint functions, React and Vue history hooks, and a full editor surface for custom root layouts.
- 0b97673: Add ENIG gold as a Live Paint material for enclosed KiCad regions. Gold layers stay editable, and manufacturing export adds matching isolated copper and solder-mask openings with clearance checks.
- 2c318d1: Provide typed framework components that own editor lifecycle and share state across composable parts.
- 2092404: Search Google Fonts, preview static variants and use them in editable text. Pin font provenance while saving self-contained outlines, and retain bundled fonts when the font service is unavailable.
- 2092404: Use Google Fonts Geist for newly drawn text and remove the bundled Geist files and offline picker option. Saved legacy outlines still display and export; choose a Google font before editing older text.
- 2092404: Make Google Fonts the primary searchable family picker, with immediate selection, keyboard navigation, on-demand previews, a separate style control and bundled Geist offline fallback. Keep the popup within embedded editor shadow roots and preserve artwork while fonts load or fail.
- 2c318d1: Provide the full Overprint editor as a framework-independent Web Component with isolated state, scoped keyboard shortcuts, and host-managed documents. Add Storybook examples for React, Vue, and plain JavaScript using the same editor implementation as the standalone app.
- 2092404: Save reusable artwork compositions locally, including both board sides. Place editable copies or pinned linked instances, preview revision updates, and detach snapshots even when their library source is missing.

### Patch Changes

- 2c318d1: Restore the application's canvas grid background in the embedded editor.
- ce1375e: Allow ENIG Live Paint in enclosed SVG cutouts and compound filled paths, preserving their holes and transforms.
- 2092404: Update text directly while typing or changing its settings, with grouped undo and preservation of the last valid outlines during invalid input.
- 2092404: Keep the text inspector steady while typing by removing transient outline progress from its visible layout.
- 66d197a: Replace a placed SVG without rebuilding its placement. New proportions fit inside the existing footprint while preserving its center, rotation, layer, and undo history.
