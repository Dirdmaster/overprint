# Export behavior and limits

The preview background is **printed ink over white solder mask**. Export combines it with visible KiCad silkscreen and artwork, then removes board holes and exposed-pad openings.

Hiding native silkscreen removes it from the export. Recoloring it replaces the conventional silkscreen with color printing on that side. Copper, mask and outline commands are retained with compatibility comments; drills remain unchanged.

ENIG Live Paint adds a solder-mask opening for each gold region and clears the color file above it. In clear space, Overprint also adds isolated decorative copper. When one continuous native copper region fully covers the painted shape, it opens the mask over that copper without adding copper for that shape. Partial copper overlaps are rejected. Enclosed cutouts stay mask-covered, without added copper. Overprint checks 0.25 mm clearance from board edges, holes, mask openings and other gold regions, plus existing copper clearance where it adds decorative copper. Select ENIG as the surface finish at JLCPCB; finish applies to all exposed copper, including ordinary pads. Extra exposed gold area may affect pricing. [JLCPCB describes the exposed-copper finish](https://jlcpcb.com/blog/basic-design-of-solder-mask) and [ENIG area charges](https://jlcpcb.com/help/article/in-what-cases-will-there-be-charged-extra).

## Size limits

| Item | Limit |
| --- | --- |
| Color resolution | 1200 DPI |
| Single image | 8192 pixels per axis or 40 megapixels; larger boards use adjacent tiles |
| Total color image area | 256 megapixels per side |
| Manufacturing ZIP / saved project | 20 MB each |
| SVG artwork | 2 MB per graphic, 100 graphics |
| Component models | 8 MB uncompressed |
| Undo history | 50 edits, current session only |

Browser storage quotas vary. Download a `.overprint` file to keep a backup.

## Alpha limitations

- Check both sides in JLCPCB’s **Gerber Viewer** before ordering. Its ordinary quote preview does not show the colors.
- Physical colors, registration, rear-side printing and JLCPCB’s handling of tiled exports still need validation.
- JLCPCB’s upload and color-file interfaces are undocumented and may change.
- Live Paint supports closed native regions, filled SVG shapes and compound-path cutouts. It does not subdivide intersecting paths, paint clipped/masked SVGs, or flood-fill raster images. See [Live Paint](live-paint.md).
- Assembled preview requires WebGL. Model failures leave the 2D editor available.
- Native plugin testing has focused on macOS with KiCad 10. Windows and Linux still need testing.
