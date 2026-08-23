# Arcade Hub — Refactor & Improvement Progress

Tracking the multi-phase overhaul of bittuhere.github.io (a Firebase-powered SPA arcade).

## ✅ Phase 1 — Foundation (DONE)
- **Cloned** the repo; git safety net configured.
- **Extracted all 10 srcdoc games** → `games/{dino,flappy,pacman,car,snake,rps,rpsrand,ttt,multittt,multicar}.html`
  - `index.html`: 15,472 → 10,177 lines (1.17MB → 522KB)
  - Each game is now an editable, debuggable, lintable standalone file (no more giant escaped `srcdoc`).
  - `tools/extract_games.py` — robust `</iframe>`-boundary extractor.
- **Rewrote the lazy iframe loader** (`_mountGame`/`_unmountGame`) to work with `src=` files instead of `srcdoc` strings. Preserves: zero-RAM-until-opened + fresh-reset-on-open.
- **Shared engine** `games/_engine.js`:
  - `createGameLoop()` — delta-time rAF loop (auto-pause on tab hide, dt clamp, optional fixed-timestep). Motion identical on 60/90/120/144Hz.
  - `makeCrisp()` — HiDPI canvas helper.
  - `createSpriteDrawer()` — rasterise inline SVG art (replaces heavy base64 PNGs).
  - `submitScore()` — one reliable score-sync helper for all games.
- **Fixed Snake's framerate bug**: `moveTimer += 16.6` (hardcoded 60fps) → real clamped delta time. Snake no longer runs 2× faster on 120Hz phones.
- **Syntax audit**: `tools/check_syntax.py` validates every inline `<script>`. All 23 scripts pass ✅.

## 🔄 Phase 2 — In progress
- [x] **Web Push notifications (FCM)** — built & wired (js/push.js, firebase-messaging-sw.js, functions/index.js). Players get pushes even with the site closed. Needs VAPID key + `firebase deploy --only functions` — see `SETUP_PUSH.md`.
- [x] Apply delta-time fix to Snake (done) — **flappy, dino, pacman, car, multicar still need it** (same `+= 16.6`/`setInterval` pattern).
- [ ] Replace base64 PNG sprites with SVG art (engine's `drawSVG` ready).

## ✅ Phase 2b — Branding / favicons / social (DONE)
- **Triple-layer favicon**: fixed the "SVG not showing" bug (was `type=image/x-icon` on an `.svg`). Now `favicon.ico` (16/32/48/64) + sized transparent PNGs (16…512) + crisp `favicon.svg`. Apple-touch-icon (180, opaque).
- **Social cards**: proper 1200×630 branded `preview.png` + Twitter/X Card tags + `og:locale`/`og:image:alt`/`secure_url`.
- **PWA manifest**: real 192/512 icons (was wrongly using the OG image), scope/description/categories.
- **`.nojekyll`**: CRITICAL — stops GitHub Pages hiding `games/_engine.js` (files starting with `_` are skipped by Jekyll).

## 🧪 Pre-push click-test (do this in the preview, ~2 min)
1. Log in. 2. Open each game — confirm it loads & plays (Snake, Flappy, Dino, Pac-Man, Car, RPS, TTT, Multi-TTT, MultiCar). 3. Confirm Snake runs at normal speed. 4. Favicon shows in the tab. ✅ → push.

## 📋 Phase 3 — Planned (not blockers for a safe push)
- [ ] Delta-time fix for flappy, dino, pacman, car, multicar (same `+=16.6`/`setInterval` bug).
- [ ] Replace base64 image sprites with SVG art (engine `drawSVG` ready).
- [ ] Game UI polish + Fair Copies improvements + new feature ideas.

## How to run locally
```
python3 -m http.server 8000   # then open the preview
python3 tools/check_syntax.py # audit all scripts
```
