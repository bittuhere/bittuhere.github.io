/* =====================================================================
   Arcade Hub — Shared Game Engine  (games/_engine.js)
   ---------------------------------------------------------------------
   Loaded by every game via <script src="_engine.js"></script>.
   Provides framerate-independent utilities so a game plays identically
   on 60Hz / 90Hz / 120Hz / 144Hz screens.

   Core idea: NEVER advance game state by a fixed per-frame constant.
   Always scale by real elapsed time (delta). This file makes that easy.
   ===================================================================== */
(function (global) {
    'use strict';

    var ArcadeEngine = {};

    /* -----------------------------------------------------------------
       createGameLoop({ update, render, maxDelta })
         update(dt, t)  — step simulation by dt seconds (dt is in SECONDS)
         render(alpha)  — draw current state (alpha 0..1 interpolation)
       Returns { start, stop, pause, resume, isRunning }.
       - Uses requestAnimationFrame (VSync; uncapped refresh, buttery on
         120Hz phones) but motion is identical across refresh rates because
         everything scales by real dt.
       - Pauses automatically when the tab is hidden (saves battery, avoids
         huge dt jumps on return).
       - Clamps dt to maxDelta (default 0.1s) to prevent the "spiral of
         death" after a lag spike / tab switch.
       - Auto-stops on the SPA 'spa-back' message so the loop never leaks.
       ----------------------------------------------------------------- */
    ArcadeEngine.createGameLoop = function (opts) {
        opts = opts || {};
        var update = opts.update || function () {};
        var render = opts.render || function () {};
        var maxDelta = opts.maxDelta || 0.1;       // seconds cap
        var fixedStep = opts.fixedStep || 0;       // >0 = fixed-timestep sim

        var rafId = null;
        var lastTime = 0;
        var accumulator = 0;
        var running = false;
        var paused = false;
        var startedAt = 0;

        function frame(timestamp) {
            if (!running) return;
            rafId = global.requestAnimationFrame(frame);

            if (paused) { lastTime = timestamp; return; }

            if (!lastTime) lastTime = timestamp;
            var dt = (timestamp - lastTime) / 1000;   // seconds
            lastTime = timestamp;
            if (dt > maxDelta) dt = maxDelta;          // clamp spikes

            if (fixedStep > 0) {
                // Fixed-timestep simulation with interpolation alpha.
                accumulator += dt;
                var steps = 0;
                while (accumulator >= fixedStep && steps < 5) {
                    update(fixedStep, timestamp / 1000);
                    accumulator -= fixedStep;
                    steps++;
                }
                render(accumulator / fixedStep);
            } else {
                // Variable-timestep: hand the real dt to the game.
                update(dt, timestamp / 1000);
                render(1);
            }
        }

        function start() {
            if (running) return;
            running = true;
            paused = false;
            lastTime = 0;
            accumulator = 0;
            startedAt = performance.now();
            rafId = global.requestAnimationFrame(frame);
        }
        function stop() {
            running = false;
            if (rafId) global.cancelAnimationFrame(rafId);
            rafId = null;
        }
        function pause() { paused = true; }
        function resume() { if (running) { paused = false; lastTime = 0; } }

        var loop = { start: start, stop: stop, pause: pause, resume: resume,
                     isRunning: function () { return running; } };

        // Auto-pause when tab hidden (mobile + desktop), resume on return.
        function onVis() {
            if (!running) return;
            if (document.hidden) pause(); else resume();
        }
        document.addEventListener('visibilitychange', onVis);

        // Stop the loop if the SPA asks the game to go back (no leak).
        global.addEventListener('message', function (e) {
            if (e.data === 'spa-back') stop();
        });

        return loop;
    };

    /* -----------------------------------------------------------------
       lerp(a, b, t)  — linear interpolation, used for smooth motion.
       clamp(v, min, max)
       randInt(min, max) inclusive
       aabb(ax,ay,aw,ah, bx,by,bw,bh)  — axis-aligned box overlap test
       ----------------------------------------------------------------- */
    ArcadeEngine.lerp = function (a, b, t) { return a + (b - a) * t; };
    ArcadeEngine.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
    ArcadeEngine.randInt = function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; };
    ArcadeEngine.aabb = function (ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    };

    /* -----------------------------------------------------------------
       createSpriteDrawer(ctx)
         drawSVG(svgMarkup, x, y, w, h, rot) — rasterise an inline SVG to
         an offscreen <img> once (cached) then blit it. Lets games use
         crisp vector art instead of heavy base64 PNGs.
       ----------------------------------------------------------------- */
    ArcadeEngine.createSpriteDrawer = function (ctx) {
        var cache = {};
        function get(svg) {
            if (cache[svg]) return cache[svg];
            var img = new Image();
            // utf-8 safe data URI
            var uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            img.src = uri;
            cache[svg] = img;
            return img;
        }
        return {
            drawSVG: function (svg, x, y, w, h, rot) {
                var img = get(svg);
                ctx.save();
                ctx.translate(x + w / 2, y + h / 2);
                if (rot) ctx.rotate(rot);
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
                ctx.restore();
            },
            ready: function (svg) { var img = get(svg); return img.complete && img.naturalWidth > 0; }
        };
    };

    /* -----------------------------------------------------------------
       HiDPI canvas helper. Call once on a canvas to make it crisp on
       retina/phone screens without changing the logical coordinate size.
       ----------------------------------------------------------------- */
    ArcadeEngine.makeCrisp = function (canvas, logicalW, logicalH) {
        var dpr = Math.min(global.devicePixelRatio || 1, 2.5); // cap for perf
        canvas.width = Math.round(logicalW * dpr);
        canvas.height = Math.round(logicalH * dpr);
        canvas.style.width = logicalW + 'px';
        canvas.style.height = logicalH + 'px';
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    };

    /* -----------------------------------------------------------------
       Score sync — one reliable implementation reused by all games.
       submitScore(gameKey, score) returns a Promise.
       Only writes to Firebase if it's a new personal best (locally +
       cloud). Works offline (falls back to localStorage).
       ----------------------------------------------------------------- */
    ArcadeEngine.submitScore = function (gameKey, score) {
        var lsKey = gameKey + '_highscore';
        var localBest = parseInt(localStorage.getItem(lsKey) || '0', 10) || 0;
        var isNewLocal = score > localBest;
        if (isNewLocal) localStorage.setItem(lsKey, String(score));

        var name = (localStorage.getItem('playerName') || '').toLowerCase().trim();
        if (!name || typeof firebase === 'undefined' || !firebase.apps.length) {
            return Promise.resolve({ synced: false, newBest: isNewLocal, best: score });
        }
        var db = firebase.database();
        var ref = db.ref('users/' + name);
        return ref.child(gameKey + '_highscore').transaction(function (cur) {
            if (cur === null || score > (cur || 0)) return score;
            return cur; // no improvement -> abort write
        }).then(function (res) {
            var committed = res.committed;
            return ref.child(gameKey + '_highscore').once('value').then(function (s) {
                return { synced: committed, newBest: isNewLocal, best: s.val() || score };
            });
        }).catch(function () {
            return { synced: false, newBest: isNewLocal, best: Math.max(localBest, score) };
        });
    };

    /* -----------------------------------------------------------------
       Post a toast back to the parent SPA shell.
       ----------------------------------------------------------------- */
    ArcadeEngine.toast = function (msg, type) {
        try { global.parent.postMessage({ type: 'notify', msg: msg, nt: type || 'info' }, '*'); } catch (e) {}
    };

    global.ArcadeEngine = ArcadeEngine;
})(window);
