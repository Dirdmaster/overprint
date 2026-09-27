# Browser PCB import

Drop a saved `.kicad_pcb` anywhere in the editor, or use **Import PCB → Choose file**. Extraction runs locally in a dedicated Web Worker. Neither the source file nor the extracted board is uploaded. Existing `.overprint-board` files still use the package reader.

The extractor accepts the KiCad 6 through 10 S-expression format and emits the existing `BoardPackage`: millimetre bounds, closed outline and cutouts, drilled holes/slots, and front/back copper, mask openings, silkscreen and fabrication paths. Both sides keep KiCad's front coordinate system; the editor mirrors the back once. Spatially batched polygon unions preserve holes and separate connected objects for native ink editing. Complete shapes stay together so their holes survive batch boundaries. Curves use a 0.005 mm approximation tolerance. The native comparison fixture targets KiCad 10.

Supported geometry includes lines, rectangles, polygons, three-point arcs, circles, Bezier curves, rotated/flipped footprints, circle/rectangular/oval/roundrect/trapezoidal/custom pads, mask margins, through vias, saved zone fills, and Newstroke text with rotation, justification and mirroring. Local zero mask margins inherit footprint or board values. Explicit via tenting and saved board defaults are respected.

## Limits

- Outline endpoints within 0.01 mm are joined for the browser preview. Larger gaps and ambiguous joins stop import. This does not repair the source PCB.
- A raw PCB has no native Gerbers or drill files. Manufacturing export requires a package from the KiCad plugin; the browser importer does not synthesize fabrication files.
- External component model files are not read from your computer automatically. Use **Tools → Collect and Embed 3D Models** in KiCad 10 and save the PCB to include supported models. Missing or unsupported models are listed by reference.
- Zone fills are read as saved, never recalculated. Unfilled zones produce an import note.
- Project-dependent via tenting that is absent from the PCB defaults to tented, with an import note. Blind/buried drills and unused-pad-layer removal also have explicit notes.
- Custom fonts, text markup (overbar/subscript/superscript), text boxes, dimensions on imported layers, chamfered pads, custom pad stacks and dashed graphical strokes currently stop import with a plugin fallback. They are not silently dropped.
- This is a geometry preview, not KiCad DRC or manufacturing validation. A standalone PCB cannot supply external project rules or library/model files.
- Inputs are capped at 25 MB, two million expression tokens, 100 nesting levels and one million generated points. Extraction is cancelled after 30 seconds, on dialog close or when another file replaces the request. Output is capped at 15 MB to leave room for artwork in saved projects.

## Validation and maintenance

`tests/fixtures/generate-kicad-import.py` creates an original synthetic PCB with KiCad 10 and records its native layer polygons. Run it with KiCad's bundled Python in a desktop session when changing the fixture. No user board is included.

`tests/server/kicad-import.test.ts` compares bounds and areas to those native polygons, tests shape union, edge stitching, saved zones, invalid files, unsupported features, and a synthetic 28,000-polygon artwork footprint. `tests/e2e/kicad-file-import.spec.ts` exercises actual worker extraction through drag/drop and the picker, both sides, autosave/reload, failed imports, replacement cancellation, and absence of upload requests.

Format reference: [KiCad PCB format](https://dev-docs.kicad.org/en/file-formats/sexpr-pcb/) and [common S-expression definitions](https://dev-docs.kicad.org/en/file-formats/sexpr-intro/). Glyph provenance is recorded in [third-party notices](../THIRD_PARTY_NOTICES.md).

## Embedded component previews

1. In KiCad 10, open your board and choose **Tools → Collect and Embed 3D Models**.
2. Save the `.kicad_pcb`, then drop it into Overprint or choose it through Import PCB.
3. Select **3D**. Expand the component status to inspect missing models and warnings.

Embedded STEP/STP and static VRML 2.0 WRL models are supported. Conversion happens in the browser's import worker, with no PCB or model upload. The STEP converter is downloaded from Overprint on demand. Its first use requires access to those application assets. Project downloads retain converted component models, so reopening them does not require conversion again.

Both board-level and footprint-level embedded references are supported. Identical validated payloads and repeated mesh geometry are reused. Hidden models remain hidden. Placement preserves footprint side/rotation and model offset, rotation and scale. WRL units follow KiCad's 2.54 mm convention. Both formats use KiCad's STEP/GLB surface convention, including the copper surface and nominal 0.05 mm offset. The preview board body excludes the outer copper and mask thickness; absent stackup entries use KiCad's default 0.035 mm copper and 0.01 mm mask values.

WRL support covers static groups, translation/rotation/scale, solid primitives, indexed faces, and diffuse material colors. External resources, textures, scripts, animation, vertex colors, transparency, nonzero transform centers/scale orientations and reused transform groups are reported as unsupported. Compressed STEPZ/WRZ and IGES files are not supported.

Import limits remain 25 MB for the PCB, 8 MB for the component GLB and 15 MB for the extracted board package. Additional conversion limits are 16 MB per decoded model, 32 MB total decoded payload, 32 MB rendered geometry and 1,000 visible model instances. WRL parsing also bounds tokens, nesting and reuse. The converter itself has additional temporary memory costs; these are not a process-wide browser memory guarantee. Large assemblies may need fewer/simpler models. Limits and failures are reported, never represented as complete model coverage.

Geometry extraction and model conversion each have a 30-second deadline. A model failure or conversion timeout leaves the 2D import usable. Closing the import dialog or replacing its file cancels the worker; the current project remains unchanged until import is accepted. When a project is already open, choose **Update PCB, keep artwork** to retain artwork at its current millimetre positions. **Open board** starts a new composition instead. There is no new automatic live sync.

Fixtures and native oracles are original synthetic shapes. `generate-embedded-models.py` uses KiCad 10 to create the STEP body and native component GLB; `generate-embedded-wrl.py` creates a mixed-format board and native VRML oracle. Tests compare asymmetric front/back component vertices within 0.01 mm. The WRL comparison normalizes native VRML's centered surface convention to the shared STEP/GLB convention. These checks verify preview placement, not physical fit or fabrication readiness.

The embedded-model browser tests exercise real conversion, 3D rendering, autosave and downloaded-project restoration. See [third-party notices](../THIRD_PARTY_NOTICES.md) for converter licenses and source provenance. Custom hosts must serve the generated `/model-converter/` assets; the standard dev and production build commands prepare them automatically.
