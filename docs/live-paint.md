# Live Paint

1. Select **KiCad → Silkscreen** in Layers to edit native printing, or select an SVG graphic to paint that artwork. Selecting an artwork folder or layer scopes painting to its visible graphics.
2. Choose the paint bucket or press **K**.
3. Pick a quick swatch, or open the color field for shade, hue, and HEX controls.
4. Hover a region to preview its boundary. Click to fill it, or drag across several regions in one stroke. SVG artwork is painted even when the KiCad silkscreen reference is hidden; empty space and hidden layers never fall through to the PCB.

The cursor shows the active color between its neighboring presets. Press **A / D** or **Left / Right** to cycle colors while painting. These shortcuts leave text fields and the color picker alone.

Enclosed cutouts can be painted too. Filling a warning triangle preserves an exclamation mark inside it. Paint follows the current Front / Back side. Hold Space or the middle mouse button to pan, then return to painting; V or M returns to Select.

Painting existing KiCad ink replaces the imported path's color directly; it does not add an artwork overlay. **Base ink** changes the default color while preserving individually painted shapes. **Reset KiCad colors** restores the defaults for the current side and can be undone. Colors are stored in the Overprint project; the source PCB geometry remains unchanged.

Filling an empty enclosed area in the native reference creates new ink as a normal SVG artwork layer. Repainting an unchanged, visible fill updates that layer. Existing fill layers are retained. On a selected SVG, painting changes the clicked shape's fill inside the existing layer, retaining its curves, strokes and transforms. Closed holes in compound paths, such as outlined eye sockets, can also be filled: the curved face is added inside that same SVG beneath its existing outline. One undo reverses the whole drag stroke; redo restores it. Escape stops the current stroke. Edits autosave and travel with downloaded projects. Hover previews remain on the target after painting and update when cycling colors.

Preview, assembled preview and color manufacturing output use the native color edits below user artwork. For each edited side, the ZIP omits the original conventional silkscreen commands, since its printing is included in the color file. Native copper, mask, outline and drill data remain unchanged apart from the existing compatibility headers.

## Current limits

- Native painting targets closed polygon contours. Selected SVG painting targets existing filled vector elements and closed compound-path cutouts, retaining curves. A connected filled shape is recolored as one shape; new regions formed by intersecting paths, raster flood fills, stroke-only paths and clipped/masked SVG graphics are not supported.
- The highlight shows the chosen contour and its enclosed islands, clipped around board holes and exposed-pad clearances. These clearances also apply to manufacturing output; clicking directly in either does not create a fill.
- A fill is artwork at fixed board coordinates. Re-importing moved silkscreen does not move an existing fill automatically.
- Native colors match exact imported paths. Unchanged shapes keep their colors through Sync PCB; changed or removed paths do not receive stale individual colors. Base ink remains the side's default.
- Screen colors are not calibrated physical print samples. See [export limitations](export.md) before ordering.
