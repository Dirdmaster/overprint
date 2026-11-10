# Overprint

Overprint is a full-color PCB silkscreen artwork editor used alongside KiCad.

## Language

**PCB**:
The physical board design owned by KiCad, providing the geometry against which artwork is composed.

**Artwork**:
The editable silkscreen composition owned by Overprint.

**Sync PCB**:
An explicit user action that refreshes the PCB state used by Overprint.

**Manufacturing preview**:
The intended appearance of the board with artwork, including exposed pads and holes, rather than the artwork image alone. Its accuracy depends on the manufacturing rules represented.

**Project**:
A named PCB and its artwork, with the display settings needed to resume editing.

**Library composition**:
Reusable artwork containing one graphic or an arrangement of graphics on either or both board sides. It contains no PCB geometry.

**Library revision**:
An immutable saved version of a library composition.

**Linked instance**:
A placed composition associated with one library revision, with its own position, size and rotation. It keeps that revision until the designer explicitly updates or detaches it.

**Independent copy**:
Placed library artwork that can be edited without changing or receiving updates from its source composition.

**Workspace backup**:
A portable copy of local projects and library compositions, including the revisions needed to preserve their relationships.
