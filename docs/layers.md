# Layers

Layers has two persistent artboard roots, **Front** and **Back**. Each has an independently collapsible artwork stack and native silkscreen entry. Both remain available when the canvas focuses one board. Selecting artwork activates its artboard without replacing the layer hierarchy; double-click an artboard heading to fit that board. New layers, folders and imports belong to the active artboard.

Drag a detached layer or folder onto the other artboard heading, or choose the other artboard in **Move to**, to transfer it. Folder descendants move together, the root leaves its previous parent, and physical frames and editable settings remain unchanged. One undo restores the original hierarchy and artboard. Locked subtrees, linked library instances and ENIG geometry cannot be transferred this way. Properties, alignment and history controls are shared rather than repeated for each artboard.

Drag a layer's name to rearrange it. The insertion line marks its new position; higher rows draw above lower rows.

Each artboard has a fixed native **Silkscreen** entry for base ink color edits. Live Paint works directly on visible ink without selecting a layer. The shared **KiCad** reference group controls **Silkscreen** and **Fabrication overlay** visibility. KiCad controls these layers' geometry; they cannot be moved, deleted or nested inside artwork folders.

- Drop in the middle of a folder or layer group to put artwork inside it. A collapsed destination opens after the drop.
- Drop near a row's top or bottom edge to place it before or after that row, at the same nesting level.
- Drop on **Move to Front/Back artboard**, shown while dragging, to move out of a folder to the bottom of the root stack.
- Folders move with their contents. They cannot be dropped inside themselves or their descendants.
- Press Escape to cancel. Each completed move has one undo step and is autosaved with the project.

Drag-and-drop uses the browser's native mouse/trackpad interaction. The **Bring forward**, **Send backward**, and **Move to** controls remain available for keyboard and touch use. KiCad reference layers are fixed; only artwork layers can be moved.

## Align artwork

Select a graphic to show **Align** in the inspector. Hold **Shift** while clicking graphics on the canvas or their layer names to add/remove them from the selection.

- **Board** aligns to the PCB's rectangular bounds. Use the two center buttons to center artwork on the PCB.
- **Selection** lines up selected graphics with their combined bounds.
- **Key object** keeps the chosen graphic fixed while the others line up with it.
- **Horizontal / Vertical** distribute three or more selected graphics with equal gaps. Choose Board to spread across its bounds, or Selection to keep the outer edges in place. Key-object distribution is unavailable.

Alignment uses each graphic's rotated SVG viewport, including any whitespace in the SVG. Left and right follow the displayed side, including the mirrored back. Curved board outlines do not add an inset; artwork at an edge may be clipped by the PCB outline.

Drag any selected graphic to move the multi-selection together. Delete/Backspace removes the selection. Each alignment, distribution, drag, or deletion has one undo step and uses the existing autosave. Select one graphic for its resize/rotation handles and numeric transform fields. Folders and native KiCad geometry cannot be aligned; hidden artwork is excluded. Live Paint targets the active (last selected) graphic.


## Editable text

Choose **Draw text (T)** and click either board side. Search Google Fonts and choose
a family and style in the inspector, then edit content, size, spacing, alignment
and fill. New text uses Google Fonts Geist. The font service must be configured
for creation and font edits; saved outlined artwork displays and exports offline.

Projects save font provenance, editable settings and frozen filled SVG paths.
Preview, 3D and manufacturing export use those same paths. Resizing scales the
geometry. Use Print review to inspect actual ink, counters, pad clearances and
board edges. These advisory checks do not certify physical print quality.

Live Paint recolors editable text while retaining its settings and saved font outlines. Convert to SVG for individual counters or ENIG. Undo restores its settings.
Earlier stroke-text project files remain readable through the compatibility
inspector, but new text creation uses the Google Fonts path.
