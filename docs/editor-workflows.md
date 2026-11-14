# Artwork workflows

New text uses the merged Google Fonts integration. Search families, preview a
style and edit content in the text inspector. Fonts are fetched on demand through
the configured server. Projects store pinned font provenance and filled outlines,
so saved artwork displays and exports without downloading fonts. There is no
bundled font selector or fallback for new text. Older stroke-text projects retain
a compatibility inspector.

## Draw and edit

Use rectangle, rounded rectangle, ellipse or line tools to drag a shape on either
board face. Shift constrains proportions or line angles. The pen tool adds a node
per click; click the first node to close the contour. Enter finishes an open path, and
Backspace removes the last pending node. See [canvas tools](canvas-tools.md) for
groups, shortcuts, selection and modifier gestures.

Select a filled graphic and use Vector editing to convert it to editable nodes.
Select multiple graphics to combine, subtract the top graphic or intersect their
filled regions. Boolean operations preserve holes and create one filled vector.
They require filled paths; expand strokes and remove unsupported clipping first.
Use Edit vector nodes to drag nodes, or edit their coordinates in the inspector.
Live Paint changes an editable vector's fill while preserving nodes. Convert an appearance to SVG before painting individual regions, or convert editable artwork for ENIG. Undo restores metadata.

## Reuse and place

The local library stores selections or complete front/back compositions. Linked
instances pin their source revision. Preview an update before applying it, or
detach an instance for independent edits. Project/library backup includes the
local workspace without an account. See [libraries](artwork-libraries.md) and
[local projects](local-workspace.md).

Smart placement offers an optional board/grid snap, with grid positions relative
to the PCB origin. Search pad and footprint references, center artwork on an
anchor, or preview a numeric line/circle repeat. Cancel leaves the project alone;
Apply creates one undo step. A changed project invalidates an older repeat
preview. Both sides use the same physical board coordinates.

## Color and review

Palette and fills stores named project colors and replaces a color throughout
artwork, including hidden and rear layers. Gradients, stripes and dots freeze to
portable SVG while retaining their own appearance settings. Applying an appearance
replaces editable text/shape/vector settings; Undo restores them. Linked and locked
artwork must be detached or unlocked before changes. Printed color matching still
requires physical samples. ENIG uses the separate Gold paint target.

Print review checks filled artwork against board boundaries, pad openings and an
advisory legend profile. It screens sampled ink for thin features, small counters
and small gaps. Click a finding to select and focus its geometry. Download the
sourced report, or find a freshly generated report in the manufacturing ZIP.
Unsupported geometry is reported explicitly. The profile's conventional legend
limits do not qualify full-color printing or replace circuit DRC and fabrication
approval.

PCB revisions stages a file update with old/new geometry and artwork previews.
Review changed outlines, pads and anchors, then cancel or save a recovery revision
and apply. Restore creates another recovery copy before returning to the previous
project. Revisions are ordinary local projects and travel in workspace backups.
