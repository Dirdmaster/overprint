# Export behavior and limits

The preview background is **printed ink over white solder mask**. Export combines it with visible KiCad silkscreen and artwork, then removes board holes and exposed-pad openings.

Hiding native silkscreen removes it from the export. When the color image contains native silkscreen, the ZIP keeps an empty conventional silkscreen layer on that side so a separate black print pass cannot cover the artwork. Copper, mask, and outline keep their KiCad geometry with compatibility metadata. Drill file contents stay the same.

ENIG Live Paint adds a solder-mask opening for each gold region and clears the color file above it. In clear space, Overprint also adds isolated decorative copper. When one continuous native copper region fully covers the painted shape, it opens the mask over that copper without adding copper for that shape. Partial copper overlaps are rejected. Enclosed cutouts stay mask-covered, without added copper. Overprint checks 0.25 mm clearance from board edges, holes, mask openings and other gold regions, plus existing copper clearance where it adds decorative copper. Select ENIG as the surface finish at JLCPCB; finish applies to all exposed copper, including ordinary pads. Extra exposed gold area may affect pricing. [JLCPCB describes the exposed-copper finish](https://jlcpcb.com/blog/basic-design-of-solder-mask) and [ENIG area charges](https://jlcpcb.com/help/article/in-what-cases-will-there-be-charged-extra).

Rear color PNGs face the back of the board, including pad and hole cutouts. The rear SVG reflects each image into native PCB coordinates and reflects the whole group back into the rear print orientation, following EasyEDA Pro. Inspect both sides in JLCPCB's Gerber Viewer.

## Panels

Choose **New panel** from Projects or **Create panel** in the editor. Select saved Overprint projects that include Gerbers and drills. A single design uses a rows-and-columns grid. Mixed panels let you set each design’s quantity and adjust the position or quarter-turn rotation of each copy.

The builder checks the copper layer count and asks you to confirm the other fabrication settings for mixed designs. It supports two- and four-layer boards, up to 36 copies and ten designs. It adds 5 mm rails and routed gaps from 2 to 5 mm, with at least two breakaway connections per board. Each perforated edge has five 0.60 mm nonplated holes with 0.95 mm center spacing (0.35 mm between hole edges on a straight edge). Clearance checks may reject boards with copper, drilled features, or unsafe tab positions at a routed edge. Color ink stays within the original boards.

The preview updates as you edit and shows the routed outline and breakaway holes once the fabrication check passes. Save the panel to keep its placement and pinned artwork and fabrication revisions. You can review a newer source revision before applying it. Workspace backups include saved panels and their pinned files.

Use **Choose tab edges** to place evenly spaced rows on selected sides. The sides refer to each PCB before rotation. Use **Adjust placements** to override the allowed edges for individual copies. Tabs between two copies need allowed facing edges and aligned rows. If a row cannot fit safely, change the edges, count, or spacing before downloading.

At JLCPCB, select **Panel by Customer** and **EasyEDA multi-color silkscreen**. Set the number of distinct designs for mixed panels. This workflow exports bare-board fabrication files. [JLCPCB’s full-color settings](https://jlcpcb.com/help/article/how-to-design-multi-color-silkscreen-using-easyeda) · [JLCPCB’s panel capabilities](https://jlcpcb.com/capabilities/Capab)

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
