# Layers

Drag a layer's name to rearrange it. The insertion line marks its new position; higher rows draw above lower rows.

The fixed **KiCad** group contains **Silkscreen** and **Fabrication overlay**. Select Silkscreen to use Live Paint on its original ink or change its base color. KiCad controls these layers' geometry; they cannot be moved, deleted or nested inside artwork folders.

- Drop in the middle of a folder or layer group to put artwork inside it. A collapsed destination opens after the drop.
- Drop near a row's top or bottom edge to place it before or after that row, at the same nesting level.
- Drop on **Move to board root**, shown while dragging, to move out of a folder to the bottom of the root stack.
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
