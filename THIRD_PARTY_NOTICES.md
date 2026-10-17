# Third-party notices

Overprint is licensed under [MIT](LICENSE). Dependencies and third-party assets retain their own licenses.

## Dependencies

- Nuxt, Vue, Three.js, fflate and Reka UI: MIT
- Lucide: ISC
- Inter: SIL Open Font License
- Playwright: Apache-2.0

See the installed packages for their full license notices.

## Names and images

The code license grants no trademark rights to Overprint or Weavers branding. X, GitHub and KiCad names and marks belong to their respective owners.

The setup guide includes a screenshot of KiCad’s interface. The order guide includes JLCPCB interface screenshots, which retain their original ownership. Original guide diagrams and the social-card layout are covered by MIT.

## Browser PCB geometry

- Clipper / JavaScript Clipper (clipper-lib): Boost Software License 1.0. The installed package contains the full license and copyright notices.
- Newstroke glyph data is vendored from [KiCanvas](https://github.com/theacodes/kicanvas), revision `b031159eb74aaa7eef2b026fd85d35bc05ff2095`. The font authors and licenses are retained in `apps/web/app/utils/kicad/newstroke-glyphs.ts`, [font provenance](docs/licenses/newstroke.md), and [KiCanvas notices](docs/licenses/kicanvas.md). The font data is separate from Overprint's MIT code.

## Embedded component model conversion

- occt-import-js 0.0.23 and its Open CASCADE WebAssembly build: LGPL-2.1, with the Open CASCADE exception as provided in the upstream notices. The application serves the original WASM separately and the upstream loader with a one-line ES module export. Full notices ship at `/model-converter/license.occt-import-js.txt` and `/model-converter/license.occt.txt`.
- Converter source and build instructions: https://github.com/kovacsv/occt-import-js/tree/0.0.23 (also distributed in the installed npm package); underlying OCCT source: https://git.dev.opencascade.org/repos/occt.git at revision `d2abb6d844231cb8f29be6894440874a4700e4a5` (the converter tag pins this submodule). Replace the separately served loader/WASM together to use a modified converter.
- fzstd 0.1.1: MIT, copyright Arjun Barrett. License retained in the installed package.

These dependencies retain their own licenses; Overprint's application code remains MIT.

## Editable text outlines

OpenType.js 2.0.0 is pinned for local path conversion under MIT. Selected Google Fonts are downloaded through the host server for browser-local outlining. Saved outlines display and export without a font request. Text outlining supports a limited Latin character set, not arbitrary scripts or emoji.

## Font picker primitives

Reka UI 2.11.0 provides accessible combobox and popover behavior under MIT. Its full notice is retained in [Reka UI notices](docs/licenses/reka-ui.md) and in the embedded editor notices.
