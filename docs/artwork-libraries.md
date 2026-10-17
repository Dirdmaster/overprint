# Artwork libraries

Open **Library** in the board inspector. Name a composition and choose the artwork to capture. The capture list includes both board sides; selecting a folder includes its children. Native KiCad layers are excluded. Individual graphics and multi-part compositions use the same workflow.

**Place copy** creates independent editable artwork. **Place linked** creates one instance spanning every populated side. Position, rotation, uniform size, visibility and deletion apply to the whole instance. Linked compositions remain at the board root so hiding a side-specific folder cannot hide only half an instance. Detach before editing the contents or using Live Paint. Detaching is undoable and preserves drawing metadata, hierarchy and stacking order.

Library revisions are immutable. Select new source artwork in the capture list and choose **Save new revision** on an existing asset. Existing projects stay pinned to their saved revision. Select a linked instance and choose **Check for updates** to compare both sides before **Apply update**. Updates preserve the instance's center, rotation and scale. Undo returns to the old snapshot.

Rename and search help organize up to 100 library compositions. Delete asks for confirmation and removes only the source asset. Every placed linked instance carries its own validated artwork snapshot, so deletion, a missing library, or opening the project on another device does not blank the artwork or block export. Saving a linked instance into another library item captures a snapshot with no nested live links.

Libraries and projects are stored locally in this browser. Download projects to retain their placed snapshots. Clearing browser site data removes the library; there is no account or automatic cloud synchronization. Each asset allows up to 100 revisions and 20 MB of serialized data, and each side's generated SVG must fit the existing 2 MB graphic limit. Expanding copies or detaching must stay within the project's 100-item limit.

Linked instances render and export through the existing SVG artwork pipeline. Preview and browser tests do not qualify physical print results; check both sides in the manufacturer's viewer before ordering.
