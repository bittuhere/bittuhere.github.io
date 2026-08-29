# PDF.js — official Mozilla viewer (vendored into Arcade Hub)

**Do not edit anything in this folder** — it is Mozilla's official PDF.js
release, shipped byte-for-byte unmodified.

| What            | Value |
|-----------------|-------|
| Product         | PDF.js (viewer + engine) by Mozilla |
| Version         | **3.11.174** (last 3.x stable — widest device support, incl. older Android Chrome) |
| Obtained from   | https://github.com/mozilla/pdf.js/releases/download/v3.11.174/pdfjs-3.11.174-dist.zip |
| License         | Apache License 2.0 — see `LICENSE` (CMap data © Adobe, same license) |
| Files included  | `engine/pdf.js`, `engine/pdf.worker.js`, `web/viewer.html`, `web/viewer.js`, `web/viewer.css`, `web/images/`, `web/locale/` (112 languages incl. `hi-IN`), `web/cmaps/`, `web/standard_fonts/`, demo PDF |
| Files skipped   | `.map` sources, `debugger.js`, `pdf.sandbox.js`, minified variants |

## How the site uses it (no patches!)

`js/pdf-embed.js` (Arcade Hub's bridge) does only officially-supported things:

1. Downloads the PDF itself (real byte progress bar).
2. Creates a same-origin `blob:` URL — this is what passes the viewer's
   own `validateFileURL()` security check (the viewer refuses plain
   cross-origin URLs like Google Drive links by design).
3. Opens `pdfjs/web/viewer.html?file=<blob-url>` inside a fullscreen
   `<iframe>` modal.
4. On the viewer's `documentloaded` event, calls its public API
   `PDFViewerApplication.setTitleUsingUrl("Real Name.pdf")` so the title,
   download button and print header use the real file name.

Bare `pdfjs/web/viewer.html` also works standalone (it opens the bundled
demo PDF, exactly like https://mozilla.github.io/pdf.js/web/viewer.html).

## Upgrading later

Download a newer `pdfjs-<version>-dist.zip` from
https://github.com/mozilla/pdf.js/releases, replace this folder's contents
(keep `README-ARCADE.md` and `LICENSE`), and bump `PDFJS_CACHE` in `/sw.js`
to `'ah-pdfjs-<new version>'`. Note: PDF.js 4.x+ ships an ESM-only viewer
(`viewer.mjs`) and requires newer browsers — 3.11.174 is the last release
that supports older Android devices, which is why it was chosen.

### `web/viewer.js` (ONE patch)
- `beforeUnload()` → no-op. It fired the browser's "Leave site? Changes you
  made may not be saved" dialog after ANY annotation state was touched —
  even for read-only PDFs — and from inside the viewer iframe it could block
  navigation of the whole Arcade Hub page. Every other byte is official.

