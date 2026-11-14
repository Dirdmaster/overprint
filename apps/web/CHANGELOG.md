# @overprint/web

## 0.1.0-alpha.3

### Minor Changes

- a324af5: Organize Layers into persistent, independently collapsible Front and Back artboards with compact artwork stacks and native ink entries. Activate an artboard by selecting its artwork, double-click its header to fit it, and move detached artwork or folders between artboards with undo while retaining their physical frames and descendants. Keep shared properties and history controls in one place.
- a324af5: Retain readable stroke-text project compatibility while consolidating new text creation and the host API on the merged Google Fonts integration. Preserve portable filled outlines for previews and manufacturing exports.
- a324af5: Default Live Paint to all visible layers so a layer selection is no longer required. Follow visual stacking across artwork, collapsed folders and native ink, protect locked and linked artwork without a target selector. One drag across several layers remains one undo step.
- a324af5: Dock Paint controls in the inspector, combine project swatches with presets and recently used ink, and add I or Option/Alt sampling from visible artwork. Color fills retain editable shape, vector and text metadata, including frozen Google Fonts outlines. Painting follows the cursor without changing selection, and compact controls adapt to narrow screens.
- a324af5: Make saved project colors directly available in Paint with a visible swatch grid, active-color indication, quick-save naming popover, and inline rename/delete management. Keep saved colors visible in compact mobile Paint, separate them from default swatches, and reuse the same named palette in selection color pickers and portable projects.
- a324af5: Organize the inspector into Layers, Color, Layout, and Board tabs instead of stacking unrelated feature drawers beneath Layers. Put selection fill and stroke editing in Color, expose snapping and alignment in Layout, and group print checks and PCB updates with board settings. Keep undo and redo available in every panel and support keyboard tab navigation without losing selections or repeat previews.
- a324af5: Replace the composition library's text-heavy capture list and asset forms with a visual artwork picker and saved composition gallery. Preview Front and Back artwork, select graphics with thumbnail checkboxes, search saved compositions, and place copies or linked instances from a shared detail panel. Keep revision, rename, and delete controls under Manage composition.
- a324af5: Replace the effects-focused Color inspector with selection-scoped fill and stroke color editing. Show the artwork's actual colors, preserve geometry and editable metadata, support native silkscreen colors by artboard, and commit each color edit in one undo step. Keep saved colors and project-wide replacement separate and provide a direct Paint shortcut for individual regions.

### Patch Changes

- a324af5: Add pen paths, node editing and filled-shape Boolean operations; board-aware snapping and repeat previews; named Paint swatches and selection fill/stroke editing; clickable geometry print review and sourced manufacturing reports; and PCB update previews with recoverable local revisions. Preserve the merged Google Fonts, library, drawing and local-project workflows. Show both board faces by default and verify the editor with a reproducible native Mac browser runner.
- a324af5: Group related canvas tools into accessible flyouts with remembered choices, press-and-hold and keyboard access. Adopt V/A/M/L/P/T/H tool shortcuts, persistent shape and pen tools, Shift-constrained drawing and movement, Option/Alt centered shapes, marquee selection and direct node editing. Pen paths preview the next segment and close at the first node. Show path controls only for a relevant selection and reserve A for Direct Selection while Live Paint retains arrow-key color cycling.
  
  Use an icon-only palette with corner group indicators, anchored flyouts and shortcut hints in tooltips and menus. Option/Alt-click cycles grouped tools. Reserve canvas space for the palette and remove the persistent hint card.
- a324af5: Make both visible board sides directly paintable on the first click. Share one undo checkpoint across a drag spanning front and back, route hover and eyedropper previews to the face under the cursor, and handle color shortcuts once per editor.
- a324af5: Let Live Paint highlight and recolor disconnected stripes within a single raw SVG compound path independently. Preserve original curve commands, nested holes, transforms and winding rules, with stable region identities across drag strokes, undo and saved projects.
- a324af5: Remove Paint target and scope modes entirely. Paint always follows visible regions under the cursor across artwork and native ink, independent of selection. Simplify the controls to finish, color, swatches and the eyedropper.
- a324af5: Fix thin SVG artwork disappearing in WebKit despite a valid Paint hover target. Give sub-unit SVG images an explicit intrinsic pixel viewport for canvas previews, placement, thumbnails and manufacturing rendering while preserving saved source, viewBox, physical dimensions and editable metadata. The local Mac runner now includes WebKit checks for thin artwork on both sides.
- a324af5: Show front and back beside each other by default in the 2D workspace. Click a side to edit it, or use Front and Back to focus on one side.

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
