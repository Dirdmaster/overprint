# @overprint/web

## 0.1.0-alpha.2

### Minor Changes

- 955a5cb: Import KiCad PCB files locally in the browser without the plugin, with cancellable replacement imports and fast extraction of large artwork footprints.
- 2092404: Draw rectangles, rounded rectangles, ellipses and lines with editable dimensions, fill and stroke. Shapes retain editable parameters through undo and saved projects, and can explicitly convert to SVG for Live Paint.
- 2092404: Create editable multiline text using bundled Geist Regular and Bold, with millimetre size and spacing, alignment and fill. Text renders and exports as frozen local SVG outlines, survives saved projects without regeneration, and explicitly rejects unsupported characters. Text can convert to ordinary SVG before Live Paint.
- 2900e5e: Preview embedded STEP component models when importing a KiCad 10 PCB, without the Overprint plugin. Models are decoded locally, with missing-model reports and a usable 2D fallback.
- 2900e5e: Render embedded static WRL components alongside STEP models in browser PCB imports, preserving KiCad model units and placement. Unsupported external or active WRL content is reported per component.
- 0b97673: Add ENIG gold as a Live Paint material for enclosed KiCad regions. Gold layers stay editable, and manufacturing export adds matching isolated copper and solder-mask openings with clearance checks.
- 2092404: Search Google Fonts, preview static variants and use them in editable text. Pin font provenance while saving self-contained outlines, and retain bundled fonts when the font service is unavailable.
- 2092404: Use Google Fonts Geist for newly drawn text and remove the bundled Geist files and offline picker option. Saved legacy outlines still display and export; choose a Google font before editing older text.
- 2c318d1: Serve the interactive editor integration documentation and public LoRa demo at /integrations.
- 2900e5e: Choose Update PCB, keep artwork when reopening a board file to refresh its geometry and embedded models without clearing the artwork composition.
- fe02924: Lock artwork, layers, and folders to prevent accidental edits while preserving visibility controls and saved project state.
- bcec1e1: Build repeated or mixed full-color fabrication panels from saved Overprint projects. Arrange copies, preview both sides, download one routed panel ZIP, and keep pinned project revisions in local workspace backups.
- 2092404: Keep multiple named projects in a local gallery, with duplication, recovery copies and conflict-safe autosave.
- 2092404: Export local projects and composition libraries together, and restore validated backups as independent copies without replacing existing work.
- 2092404: Make Google Fonts the primary searchable family picker, with immediate selection, keyboard navigation, on-demand previews, a separate style control and bundled Geist offline fallback. Keep the popup within embedded editor shadow roots and preserve artwork while fonts load or fail.
- 187410a: Give local projects a dedicated, searchable workspace page with compact actions, recent previews and backup access.
- 2092404: Save reusable artwork compositions locally, including both board sides. Place editable copies or pinned linked instances, preview revision updates, and detach snapshots even when their library source is missing.

### Patch Changes

- bcec1e1: Include board, hole, and solder-mask clipping geometry in the color SVG alongside the transparent PNG pixels.
- bcec1e1: Use the PCB outline and three inset registration marks in the JLCPCB color export, including for shaped boards with cutouts.
- 2c318d1: Expose composable canvas and control elements, shared controller actions and UI state subscriptions, CSS parts and theme tokens. Keep the full editor available with the same shared layer and canvas implementation.
- bcec1e1: Automatically dismiss workspace confirmations while keeping recovery warnings visible.
- ce1375e: Allow ENIG Live Paint in enclosed SVG cutouts and compound filled paths, preserving their holes and transforms.
- e137cfa: Bake rear color orientation into exported PNGs, including tiled boards, so bottom artwork and pad cutouts no longer depend on an outer SVG mirror transform.
- bcec1e1: Use reference JLCPCB layer names, a newer compatibility header, and Gerber fingerprints in color fabrication ZIPs.
- f5a7c4a: Restore screenshots in the JLCPCB order guide for deployed and source builds.
- 2092404: Update text directly while typing or changing its settings, with grouped undo and preservation of the last valid outlines during invalid input.
- 4a973a7: Open .overprint project files dropped on the editor or chosen from Import PCB instead of treating them as board exports.
- 2c318d1: Provide the full Overprint editor as a framework-independent Web Component with isolated state, scoped keyboard shortcuts, and host-managed documents. Add Storybook examples for React, Vue, and plain JavaScript using the same editor implementation as the standalone app.
- bcec1e1: Match EasyEDA's rear color SVG transforms while keeping the embedded PNG artwork readable from the back of the board.
- bcec1e1: Prevent a second conventional silkscreen pass on sides where the KiCad ink is already included in the full-color image.
- 3a5eb88: Accept small PCB outline gaps up to 0.01 mm during browser import while continuing to reject larger gaps and ambiguous joins.
- 2092404: Keep the text inspector steady while typing by removing transient outline progress from its visible layout.
- 66d197a: Replace a placed SVG without rebuilding its placement. New proportions fit inside the existing footprint while preserving its center, rotation, layer, and undo history.
