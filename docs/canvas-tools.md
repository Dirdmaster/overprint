# Canvas tools

The icon-only toolbar groups Selection/Direct Selection and the shape tools. Shortcuts appear in hover tooltips and group flyouts. Option/Alt-click cycles through the tools in a group. Each group
shows its last-used tool. Open a group with its arrow, press and hold its icon,
right-click it, or focus it and press Right/Down. Escape closes the flyout and
returns focus to the trigger. Tool groups work in the embedded editor and in
horizontal custom toolbars.

| Tool | Shortcut | Behavior |
| --- | --- | --- |
| Selection | V | Select, move and transform objects; drag empty canvas for a marquee. |
| Direct Selection | A | Select an editable vector and drag its nodes. |
| Rectangle | M | Drag to create; Shift makes a square. |
| Ellipse | L | Drag to create; Shift makes a circle. |
| Line | Backslash | Drag a segment; Shift constrains to 45-degree increments. |
| Pen | P | Click nodes; click the first node to close the path. |
| Text | T | Place editable Google Fonts text. |
| Live Paint | K | Paint visible layers without selecting first; Left/Right cycles swatches; I or Option/Alt samples ink. |
| Hand | H | Pan the canvas. Hold Space for a temporary Hand. |

Selection, shape and pen conventions follow Adobe's documented
[tools](https://helpx.adobe.com/illustrator/using/tools-in-illustrator.html) and
[keyboard shortcuts](https://helpx.adobe.com/au/illustrator/using/default-keyboard-shortcuts.html).

Shape and pen tools remain active after an object is created. Option/Alt draws a
shape from its center; combine it with Shift for centered squares and circles.
Shift-click adds/removes objects from a selection. Shift-drag constrains movement
horizontally or vertically. Marquee selection respects hidden and locked objects
and the active board face. Each move or created shape has one undo step.

The pen displays its next segment and a closing marker at its first point. Enter,
double-click, Command/Ctrl-click, or Escape finishes an open path. Backspace
removes the last pending node. Switching tools commits a path with at least two
nodes; incomplete single-node drafts are discarded. Space temporarily pans
without dropping the draft. Pen paths currently use straight segments.

Direct Selection exposes vector nodes. Keyboard arrows nudge the focused node by
0.1 mm; Shift increases this to 1 mm. Delete/Backspace removes a focused node if
the contour retains its minimum number of nodes. V returns to object selection.
Convert imported filled SVGs or editable shapes into nodes with the contextual
path inspector first. Conversion and edits are undoable.

Tool shortcuts return focus to the canvas. They leave inputs, text areas, font pickers and open dialogs alone. M now
means Rectangle. The former M alias for Selection and A/D paint-color aliases
have been removed to avoid conflicts with familiar drawing shortcuts.
