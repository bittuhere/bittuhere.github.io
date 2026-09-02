# 🚀 DEPLOY GUIDE — publish Arcade Hub to GitHub Pages

`site/` is the **production folder**. Everything inside it is exactly what
bittuhere.github.io needs — nothing more, nothing less. It was smoke-tested
in a real browser (main SPA boots with 0 errors, both PDF viewers render,
games load, service worker active).

## How to publish (the safe way)

1. Download the `site/` folder from the workspace.
2. Open your local `bittuhere.github.io` repository.
3. **Delete** these old/unused files from the repo (no longer needed):
   - `js/pdf-viewer.js` (replaced by `js/pdf-embed.js`)
   - `js/push-sender.js` (unused experiment)
   - `chess_testing.html` (WIP — keep it only if you still use it)
   - `server.js`, `package.json` (Node-only, not used by GitHub Pages)
   - `tools/`, `gas/`, `functions/`, `PROGRESS.md`, `README.md`, `SETUP_PUSH.md`
     (development files — the published site does not reference them; you can
     keep them in the repo if you want, they are harmless, just not needed)
4. **Copy the CONTENTS of `site/` into the repo root** (not the folder itself —
   the files must sit next to each other at the top level).
5. Commit + push. GitHub Pages updates within a minute or two.

## ⚠️ TWO CRITICAL THINGS

- **`.nojekyll` must be uploaded!** It is a hidden file (starts with a dot).
  Without it, GitHub Pages' Jekyll processor HIDES `games/_engine.js` (it skips
  files starting with `_`) and every game breaks. If games fail after deploy,
  check `https://bittuhere.github.io/.nojekyll` returns something (it can be
  empty — it just must exist).
- **`pdfjs/engine/` and `pdfjs6/engine/` folders must be complete** — they hold
  the actual PDF engines (`pdf.js` + `pdf.worker.js` in each). If PDFs don't
  open after deploy, this is the first thing to check.

## What's inside site/ (807 files, ~35 MB)

| Path | What it is |
|---|---|
| `index.html` | The main SPA (games, chat, Fair Copies, contact form, leaderboard) |
| `pdfjs6/` | **Official Mozilla PDF.js v6.2.108, customized** — stripped toolbar (no highlight/text/draw/image/signature/print/save/tools), our demo PDF as default. Used automatically on modern browsers. |
| `pdfjs/` | Official PDF.js v3.11.174 — automatic fallback for old browsers / file:// |
| `js/pdf-embed.js` | The bridge: real download progress (`X MB of Y · Z%`, fixed bar when size is known) → blob URL → official viewer → clean filenames. Auto-picks v6/v3 + 9s watchdog fallback. |
| `games/` | All 10 games + `games/_engine.js` (car game now has a ← HUB back button) |
| `eaglercraft.html` | Eaglercraft (linked from the arcade) |
| `sw.js`, `firebase-messaging-sw.js` | One unified service worker: caches both PDF viewers (instant + offline after first open). POSTs bypass it (upload progress fix). |
| `manifest.json`, `favicon.ico`/`.svg`/`-192`/`-512`/`apple-touch-icon`, `preview.png`, `robots.txt`, `sitemap.xml`, `404.html`, `quiz_questions.json` | PWA, SEO, social cards |

## Post-deploy checklist (2 minutes)

1. `https://bittuhere.github.io/` — site loads, login works
2. Open any game → plays normally (proves `.nojekyll` + `games/` are fine)
3. Fair Copies → open a PDF → **customized v6 viewer** opens with the REAL
   filename, download button saves with the real name
4. `https://bittuhere.github.io/pdf6.html` → gold button → Arcade demo PDF,
   toolbar shows only: views, find, page navigation, zoom
5. Open a PDF twice — the second time starts instantly (service worker cache)

## Recent changes in this build

- Contact form: real upload progress (`Uploading... X of Y (Z%)`), formsubmit-only
  (no mail-server fallback), no message autofill.
- PDF modal: no open-in-new-tab button; download shows `X MB of Y MB · Z%` with a
  FIXED filling bar (looping bar only when the size is unknowable).
- "Leave site?" dialog: eliminated at the source (both viewers' beforeunload
  patched; iframes were proven unable to cause it).
- Push notification button removed (Spark plan); push scripts no longer loaded.
- Fair Copies viewer has a ← Back button; car game has a ← HUB button.
- Lean favicon set (ico, svg, 192, 512, apple-touch) — 7 unused sizes deleted.

## Known TODOs (not deploy blockers)

- Push notifications: UI removed until a sender (GAS) is deployed — see
  `SETUP_PUSH.md` (kept outside `site/`).
