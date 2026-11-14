# Color

Select artwork on the canvas or in Layers, then open **Color**. The panel shows the selected graphic and the colors it uses, grouped into **Fill** and **Stroke**. Each color button displays its saved name or hex value.

Click a color to open its picker, choose a saved or custom color, and choose **Apply color**. This updates only that color and role in the selection. A fill and stroke that share the same color can be edited independently. Other artwork and the opposite artboard remain unchanged unless explicitly included in the selection. Each edit is one undo step; shape, text, and vector geometry remain editable.

For native KiCad silkscreen, color edits apply to the selected artboard and preserve individually painted paths in other colors. Locked artwork must be unlocked and linked instances detached before editing.

Use **Paint directly on the board** or **K** to recolor individual visible regions without selecting a layer first.

**Paint** shows saved colors as clickable swatches. Use **+** beside Saved colors to name the current paint color, and the adjacent menu to rename or delete saved entries. These colors are also available in fill and stroke pickers. **Replace a color everywhere** opens a separate dialog that explicitly affects both artboards, including hidden artwork. No effect-creation controls are offered in Color. Existing saved artwork remains renderable and exportable.
