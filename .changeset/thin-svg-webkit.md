---
"@overprint/editor": patch
"@overprint/web": patch
---

Fix thin SVG artwork disappearing in WebKit despite a valid Paint hover target. Give sub-unit SVG images an explicit intrinsic pixel viewport for canvas previews, placement, thumbnails and manufacturing rendering while preserving saved source, viewBox, physical dimensions and editable metadata. The local Mac runner now includes WebKit checks for thin artwork on both sides.
