# Browser PCB import

Drop a saved `.kicad_pcb` anywhere in the editor, or use **Import PCB → Choose file**. Extraction runs locally in a dedicated Web Worker. Neither the source file nor the extracted board is uploaded. Existing `.overprint-board` files still use the package reader.

The extractor accepts the KiCad 6 through 10 S-expression format and emits the existing `BoardPackage`: millimetre bounds, closed outline and cutouts, drilled holes/slots, and front/back copper, mask openings, silkscreen and fabrication paths. Both sides keep KiCad's front coordinate system; the editor mirrors the back once. Spatially batched polygon unions preserve holes and separate connected objects for native ink editing. Complete shapes stay together so their holes survive batch boundaries. Curves use a 0.005 mm approximation tolerance. The native comparison fixture targets KiCad 10.

Supported geometry includes lines, rectangles, polygons, three-point arcs, circles, Bezier curves, rotated/flipped footprints, circle/rectangular/oval/roundrect/trapezoidal/custom pads, mask margins, through vias, saved zone fills, and Newstroke text with rotation, justification and mirroring. Local zero mask margins inherit footprint or board values. Explicit via tenting and saved board defaults are respected.

## Limits

- A raw PCB has no native Gerbers or drill files. Manufacturing export requires a package from the KiCad plugin; the browser importer does not synthesize fabrication files.
- Referenced component model files are not contained in the PCB. Assembled models require the plugin.
- Zone fills are read as saved, never recalculated. Unfilled zones produce an import note.
- Project-dependent via tenting that is absent from the PCB defaults to tented, with an import note. Blind/buried drills and unused-pad-layer removal also have explicit notes.
- Custom fonts, text markup (overbar/subscript/superscript), text boxes, dimensions on imported layers, chamfered pads, custom pad stacks and dashed graphical strokes currently stop import with a plugin fallback. They are not silently dropped.
- This is a geometry preview, not KiCad DRC or manufacturing validation. A standalone PCB cannot supply external project rules or library/model files.
- Inputs are capped at 25 MB, two million expression tokens, 100 nesting levels and one million generated points. Extraction is cancelled after 30 seconds, on dialog close or when another file replaces the request. Output is capped at 15 MB to leave room for artwork in saved projects.

## Validation and maintenance

`tests/fixtures/generate-kicad-import.py` creates an original synthetic PCB with KiCad 10 and records its native layer polygons. Run it with KiCad's bundled Python in a desktop session when changing the fixture. No user board is included.

`tests/server/kicad-import.test.ts` compares bounds and areas to those native polygons, tests shape union, edge stitching, saved zones, invalid files, unsupported features, and a synthetic 28,000-polygon artwork footprint. `tests/e2e/kicad-file-import.spec.ts` exercises actual worker extraction through drag/drop and the picker, both sides, autosave/reload, failed imports, replacement cancellation, and absence of upload requests.

Format reference: [KiCad PCB format](https://dev-docs.kicad.org/en/file-formats/sexpr-pcb/) and [common S-expression definitions](https://dev-docs.kicad.org/en/file-formats/sexpr-intro/). Glyph provenance is recorded in [third-party notices](../THIRD_PARTY_NOTICES.md).
