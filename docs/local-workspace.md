# Projects, drawing and backups

Open **Projects** to browse saved boards, rename them, duplicate them or delete a selected project. Each project includes its board, front/back artwork and editor settings. Importing a board or project creates another saved project; updating the current PCB keeps its artwork and project identity. Autosave reports failures and offers a recovery copy when another tab has saved a newer revision.

Use the drawing toolbar to create rectangles, rounded rectangles, ellipses and lines. Select a shape to change its dimensions, fill, stroke and corner radius. Choose **Draw text**, click the board and edit content, size, weight, alignment and spacing in its inspector. Text uses bundled Geist Latin regular/bold fonts. Unsupported characters produce an error and preserve the previous artwork. Projects retain both editable metadata and frozen SVG outlines, so displaying and exporting saved text does not fetch fonts or regenerate its appearance.

Shapes and text remain editable when saved in a [library composition](artwork-libraries.md). Place a copy for independent edits, or place a linked instance with a pinned revision. Preview and apply library updates explicitly. Detach a linked instance to edit its individual graphics. Convert an editable shape or text to SVG before painting its regions with Live Paint; undo can restore the editable version.

## Back up or move your workspace

In **Projects**, choose **Export everything** to download projects and library revisions together as an `.overprint-backup` file. The current project is saved first. To restore it, select **Restore backup**, review the project/library counts, then choose **Import backup copies**. Restore adds new copies and preserves existing work. Restored links point to the restored library copies. Missing library sources retain their frozen artwork and do not attach to an unrelated existing library.

A failed or invalid restore imports nothing. Backup files are limited to 100 MB, and the workspace supports at most 1,000 projects and 100 library compositions. Restoring copies respects those combined limits. Each project or library composition is limited to 20 MB; each library composition can retain up to 100 revisions. The browser's own storage quota may be lower. **Save project** still downloads an individual portable `.overprint` file.

Storage belongs to this browser profile and site address. There is no automatic device sync. Clearing site data removes the local workspace, and browser storage is not a substitute for a separate downloaded backup. Old autosave data is retained during migration and malformed originals are not overwritten.

## Current scope

This release adds basic shapes and outlined text. Freeform pen/node editing, arbitrary SVG decomposition, uploaded fonts and nested live library dependencies are not included. Artwork previews and export checks do not qualify a physical manufacturing process.
