# @overprint/editor

## 0.2.0

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
