/* ============================================================================
   Arcade Hub — Official PDF.js viewer bridge  (js/pdf-embed.js)
   ----------------------------------------------------------------------------
   This file does NOT re-implement a PDF viewer. It embeds Mozilla's OWN,
   UNMODIFIED PDF.js viewers, shipped in the repo:

     /pdfjs6/  → official v6.2.108, CUSTOMIZED by tools/build_pdfjs6.py
                 (toolbar stripped: no highlight/text/draw/image/signature/
                  comment/print/save/tools buttons; our demo PDF by default).
                 Modern browsers only (ES modules, ~Chrome 111+).
     /pdfjs/   → official v3.11.174, unmodified. Works on old browsers AND
                 from file:// (classic scripts + fake-worker fallback).

   The bridge picks the best viewer automatically:
     • file:// or an old browser  → v3 viewer
     • modern browser on http(s)  → v6 viewer, with a 9-second watchdog that
       automatically re-opens the SAME PDF in the v3 viewer if v6 fails to
       boot (no re-download, the blob is reused).

   How PDFs are fed to either viewer (both use the same official flow):
     1. WE download the PDF (REAL byte-by-byte progress).
     2. We create a same-origin blob: URL → passes the official viewer's
        validateFileURL security check (it refuses plain cross-origin URLs).
     3. We open <iframe src=".../viewer.html?file=<blob-url>">.
     4. On the official "documentloaded" event we call the public API
        PDFViewerApplication.setTitleUsingUrl("Nice Name.pdf") so title,
        download button and print header use the REAL file name.

   Public API:
     ArcadePDFOpen.open({ url, name, downloadUrl })   // download & show
     ArcadePDFOpen.open({ arrayBuffer, name })        // show in-memory bytes
     ArcadePDFOpen.close()
     ArcadePDFOpen.setViewerPage(path)                // force a specific viewer
   ============================================================================ */
(function () {
    'use strict';

    var VIEWER_V3 = 'pdfjs/web/viewer.html';
    var VIEWER_V6 = 'pdfjs6/web/viewer.html';
    var viewerOverride = null;       // set via setViewerPage()

    /* ------------------------------------------------------------------ */
    /*  Viewer selection                                                   */
    /* ------------------------------------------------------------------ */
    function v6CapableBrowser() {
        /* v6 needs ES modules + modern JS + modern CSS. We probe with real
           features instead of user-agent sniffing. color-mix() == Chrome 111+,
           which matches PDF.js v6's browser support almost exactly. */
        try {
            return typeof structuredClone === 'function' &&
                   typeof OffscreenCanvas !== 'undefined' &&
                   typeof CSS !== 'undefined' && !!CSS.supports &&
                   CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
        } catch (e) {
            return false;
        }
    }

    function resolveViewerPage() {
        if (viewerOverride) return viewerOverride;
        /* ES modules are hard-blocked on file:// origins — only v3 can run
           when the site is opened straight from disk. */
        if (location.protocol !== 'http:' && location.protocol !== 'https:') {
            return VIEWER_V3;
        }
        return v6CapableBrowser() ? VIEWER_V6 : VIEWER_V3;
    }

    function setViewerPage(path) {
        if (typeof path === 'string' && path) viewerOverride = path;
    }

    /* ------------------------------------------------------------------ */
    /*  History isolation — THE CLOSE-BUTTON FIX                           */
    /* ------------------------------------------------------------------ */
    /* The main SPA owns the browser history: its own popstate handler
       navigates sections on every back press. This bridge must not disturb
       that, so:
       - opening the modal adds ONE ghost history entry;
       - a browser/Android BACK press while the modal is open must ONLY close
         the modal (stay on the same section!). Our popstate listener is
         registered FIRST (this file loads in <head>, the SPA's handler is
         registered later in its bottom <script>), so at target-phase the
         listeners run in registration order and stopImmediatePropagation()
         prevents the SPA from reacting to this popstate;
       - the ✕ button removes the ghost entry with a suppressed popstate.
       Result: ✕ closes the viewer ONLY — it can never act like a
       "back to hub" button. */
    var _suppressPop = false;
    window.addEventListener('popstate', function (e) {
        if (_suppressPop) {
            _suppressPop = false;
            e.stopImmediatePropagation();
            return;
        }
        if (st.visible) {
            e.stopImmediatePropagation();   // back button = close the modal ONLY
            st.pushed = false;
            hide();
        }
    });

    /* ------------------------------------------------------------------ */
    /*  UI (built once, reused for every document)                        */
    /* ------------------------------------------------------------------ */
    var ui = null;                    // { root, name, sub, fill, fillWrap,
                                      //   msg, msgMain, msgSub, frame,
                                      //   errBox, stage }
    var st = {
        blobUrl: null,                // current blob: URL (revoked on close)
        abort: null,                  // AbortController of running fetch
        pushed: false,                // did we push a history state?
        visible: false,
        hookTimer: null,
        watchdog: null,               // v6 → v3 auto-fallback timer
        docLoaded: false,             // official "documentloaded" fired
        usingV6: false,
        fellBack: false,
        page: VIEWER_V3,              // viewer page currently in the iframe
        lastOpts: null,
        lastCleanName: ''
    };

    function css() {
        var s = document.createElement('style');
        s.textContent = [
            '#ahpdf-root{position:fixed;inset:0;z-index:2147483000;display:none;',
            'flex-direction:column;background:#0f0c29;font-family:system-ui,Segoe UI,sans-serif}',
            '#ahpdf-root.ahpdf-on{display:flex}',
            '#ahpdf-bar{display:flex;align-items:center;gap:10px;padding:0 10px;',
            'height:54px;flex:0 0 54px;background:linear-gradient(90deg,#0f0c29,#302b63);',
            'border-bottom:1px solid rgba(0,243,255,.35);box-shadow:0 4px 24px rgba(0,0,0,.6)}',
            '#ahpdf-close{flex:0 0 auto;min-width:44px;height:40px;border:none;',
            'border-radius:10px;background:rgba(255,255,255,.08);color:#e8e8ff;font-size:17px;',
            'font-weight:700;cursor:pointer;transition:background .15s,transform .1s;padding:0 12px}',
            '#ahpdf-close:hover{background:rgba(0,243,255,.22)}',
            '#ahpdf-close:active{transform:scale(.94)}',
            '#ahpdf-name{color:#fff;font-weight:700;font-size:15px;white-space:nowrap;',
            'overflow:hidden;text-overflow:ellipsis;max-width:60vw}',
            '#ahpdf-sub{color:#8f8fc0;font-size:11px;letter-spacing:.4px}',
            '#ahpdf-titles{min-width:0;flex:1 1 auto}',
            '#ahpdf-fillwrap{height:3px;flex:0 0 3px;background:rgba(255,255,255,.08);',
            'overflow:hidden;display:none}',
            '#ahpdf-fillwrap.ahpdf-on{display:block}',
            '#ahpdf-fill{height:100%;width:0;background:linear-gradient(90deg,#00f3ff,#0066ff);',
            'transition:width .2s}',
            '#ahpdf-fill.ahpdf-indet{width:33%!important;animation:ahpdfslide 1s linear infinite}',
            '@keyframes ahpdfslide{from{transform:translateX(-100%)}to{transform:translateX(400%)}}',
            '#ahpdf-stage{flex:1 1 auto;position:relative;background:#525659}',
            '#ahpdf-frame{position:absolute;inset:0;width:100%;height:100%;border:0;',
            'background:#525659}',
            '#ahpdf-msg{position:absolute;left:0;right:0;top:14px;margin:auto;width:min(92%,560px);',
            'background:rgba(15,12,41,.92);border:1px solid rgba(0,243,255,.3);border-radius:14px;',
            'padding:14px 18px;color:#fff;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.55)}',
            '#ahpdf-msg b{color:#00f3ff}',
            '#ahpdf-msg .m{font-size:14px;font-weight:600}',
            '#ahpdf-msg .s{font-size:11.5px;color:#9f9fd0;margin-top:4px;line-height:1.5}',
            '#ahpdf-err{position:absolute;inset:0;display:none;align-items:center;',
            'justify-content:center;background:rgba(15,12,41,.96);padding:20px}',
            '#ahpdf-err.ahpdf-on{display:flex}',
            '#ahpdf-errbox{max-width:420px;text-align:center;color:#fff}',
            '#ahpdf-errbox h3{color:#ff5470;margin-bottom:8px}',
            '#ahpdf-errbox p{color:#b9b9e0;font-size:13.5px;line-height:1.6;margin-bottom:16px}',
            '#ahpdf-errbox button{margin:4px;padding:10px 18px;border:none;border-radius:10px;',
            'font-weight:700;cursor:pointer;font-family:inherit}',
            '#ahpdf-retry{background:linear-gradient(45deg,#00f3ff,#0066ff);color:#fff}',
            '#ahpdf-dl{background:rgba(255,255,255,.12);color:#fff}'
        ].join('');
        document.head.appendChild(s);
    }

    function buildUI() {
        if (ui) return;
        css();
        var root = document.createElement('div');
        root.id = 'ahpdf-root';
        root.innerHTML =
            '<div id="ahpdf-bar">' +
              '<button id="ahpdf-close" title="Close viewer" aria-label="Close PDF viewer">&#10006;</button>' +
              '<div id="ahpdf-titles">' +
                '<div id="ahpdf-name">document.pdf</div>' +
                '<div id="ahpdf-sub">Mozilla PDF.js &middot; official viewer</div>' +
              '</div>' +
            '</div>' +
            '<div id="ahpdf-fillwrap"><div id="ahpdf-fill"></div></div>' +
            '<div id="ahpdf-stage">' +
              '<iframe id="ahpdf-frame" title="PDF viewer" allow="fullscreen"></iframe>' +
              '<div id="ahpdf-msg"><div class="m" id="ahpdf-msgmain">Loading&hellip;</div>' +
                '<div class="s" id="ahpdf-msgsub"></div></div>' +
              '<div id="ahpdf-err"><div id="ahpdf-errbox">' +
                '<h3>Could not load the PDF</h3>' +
                '<p id="ahpdf-errmsg"></p>' +
                '<button id="ahpdf-retry">Try again</button>' +
                '<button id="ahpdf-dl">Download directly</button>' +
              '</div></div>' +
            '</div>';
        document.body.appendChild(root);

        ui = {
            root: root,
            name: root.querySelector('#ahpdf-name'),
            sub: root.querySelector('#ahpdf-sub'),
            fill: root.querySelector('#ahpdf-fill'),
            fillWrap: root.querySelector('#ahpdf-fillwrap'),
            msg: root.querySelector('#ahpdf-msg'),
            msgMain: root.querySelector('#ahpdf-msgmain'),
            msgSub: root.querySelector('#ahpdf-msgsub'),
            frame: root.querySelector('#ahpdf-frame'),
            errBox: root.querySelector('#ahpdf-err'),
            errMsg: root.querySelector('#ahpdf-errmsg'),
            btnClose: root.querySelector('#ahpdf-close'),
            btnRetry: root.querySelector('#ahpdf-retry'),
            btnDl: root.querySelector('#ahpdf-dl')
        };
        ui.btnClose.addEventListener('click', close);
        ui.btnRetry.addEventListener('click', function () {
            if (st.lastOpts) open(st.lastOpts);
        });
        ui.btnDl.addEventListener('click', function () {
            var u = st.lastOpts && (st.lastOpts.downloadUrl || st.lastOpts.url);
            if (u) window.open(u, '_blank');
        });
        document.addEventListener('keydown', function (e) {
            if (st.visible && e.key === 'Escape') close();
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Helpers                                                            */
    /* ------------------------------------------------------------------ */
    function mb(n) { return (n / 1048576).toFixed(2) + ' MB'; }

    function showMsg(main, sub) {
        ui.errBox.classList.remove('ahpdf-on');
        ui.msg.style.display = 'block';
        ui.msgMain.innerHTML = main;
        ui.msgSub.innerHTML = sub || '';
    }
    function hideMsg() { ui.msg.style.display = 'none'; }

    function setProgress(frac, indeterminate) {
        ui.fillWrap.classList.add('ahpdf-on');
        if (indeterminate) {
            ui.fill.classList.add('ahpdf-indet');
            ui.fill.style.width = '33%';
        } else {
            ui.fill.classList.remove('ahpdf-indet');
            ui.fill.style.width = Math.max(2, Math.min(100, frac * 100)).toFixed(1) + '%';
        }
    }
    function hideProgress() {
        ui.fillWrap.classList.remove('ahpdf-on');
        ui.fill.classList.remove('ahpdf-indet');
    }

    function showError(message) {
        hideProgress();
        if (st.watchdog) { clearTimeout(st.watchdog); st.watchdog = null; }
        ui.msg.style.display = 'none';
        ui.errMsg.textContent = message;
        ui.errBox.classList.add('ahpdf-on');
    }

    /* Real streamed download — the progress bar shows actual bytes.
       totalHint: the file size from Google Drive metadata (the CORS response
       often hides the Content-Length header from JavaScript). */
    function fetchPdf(url, onProgress, signal, totalHint) {
        return fetch(url, { signal: signal }).then(function (res) {
            if (!res.ok) throw new Error('Server answered HTTP ' + res.status);
            var total = parseInt(res.headers.get('Content-Length') || '0', 10) || totalHint || 0;
            if (!res.body || typeof res.body.getReader !== 'function') {
                onProgress(-1, 0, 0);                       // unknown size
                return res.arrayBuffer();
            }
            var reader = res.body.getReader();
            var chunks = [], got = 0;
            function pump() {
                return reader.read().then(function (r) {
                    if (r.done) return chunks;
                    chunks.push(r.value);
                    got += r.value.byteLength;
                    onProgress(total ? got / total : -1, got, total);
                    return pump();
                });
            }
            return pump().then(function (cs) {
                var out = new Uint8Array(got), off = 0;
                for (var i = 0; i < cs.length; i++) { out.set(cs[i], off); off += cs[i].byteLength; }
                return out.buffer;
            });
        });
    }

    function sanitizeName(name) {
        var n = String(name || 'document.pdf');
        n = n.split('/').pop().split('\\').pop();
        n = n.replace(/[#?]/g, '').trim();
        if (!n) n = 'document.pdf';
        if (!/\.pdf$/i.test(n)) n += '.pdf';
        return n;
    }

    /* ------------------------------------------------------------------ */
    /*  Talking to the official viewer (same-origin iframe)               */
    /* ------------------------------------------------------------------ */
    function hookViewer(win, cleanName, downloadUrl) {
        function apply(app) {
            try {
                app.setTitleUsingUrl(cleanName, downloadUrl || undefined);
                /* Make external links inside the PDF open in a new tab
                   (the embedded default would navigate the whole page). */
                if (app.pdfLinkService) app.pdfLinkService.externalLinkTarget = 2; // BLANK
            } catch (e) { /* non-fatal */ }
        }
        (function wait(tries) {
            if (st.hookTimer) { clearTimeout(st.hookTimer); st.hookTimer = null; }
            var app = null;
            try { app = win.PDFViewerApplication; } catch (e) { return; } // cross-origin
            if (app && app.eventBus) {
                try {
                    app.eventBus.on('documentloaded', function () {
                        st.docLoaded = true;
                        apply(app); hideMsg(); hideProgress();
                    });
                    if (app.pdfDocument) { st.docLoaded = true; apply(app); hideMsg(); hideProgress(); }
                    win.focus();
                } catch (e) { /* keep viewer usable even if hook fails */ }
                return;
            }
            if (tries < 120) {
                st.hookTimer = setTimeout(function () { wait(tries + 1); }, 100);
            }
        })(0);
    }

    /* ------------------------------------------------------------------ */
    /*  Open / close                                                       */
    /* ------------------------------------------------------------------ */
    function clearTimers() {
        if (st.hookTimer) { clearTimeout(st.hookTimer); st.hookTimer = null; }
        if (st.watchdog) { clearTimeout(st.watchdog); st.watchdog = null; }
    }

    function resetState() {
        if (st.abort) { try { st.abort.abort(); } catch (e) {} st.abort = null; }
        if (st.blobUrl) { try { URL.revokeObjectURL(st.blobUrl); } catch (e) {} st.blobUrl = null; }
        clearTimers();
        st.docLoaded = false;
        try { ui.frame.src = 'about:blank'; } catch (e) {}   // drop the old document
        hideProgress();
        hideMsg();
        ui.errBox.classList.remove('ahpdf-on');
    }

    function hide() {
        st.visible = false;
        ui.root.classList.remove('ahpdf-on');
        resetState();
    }

    function close() {
        if (!st.visible) return;
        if (st.pushed) {
            st.pushed = false;
            _suppressPop = true;      // the SPA must not see this popstate
            history.back();           // remove our ghost entry
        }
        hide();                       // stay on the CURRENT section
    }

    /* Load (or re-load) the iframe with the current blob. If the chosen
       viewer is anything other than the guaranteed-compatible v3 build and
       it fails to boot (old browser / blocked modules / bad path), the
       watchdog re-opens the SAME PDF in the v3 viewer — no re-download. */
    function launchViewer(page) {
        st.page = page;
        st.usingV6 = (page === VIEWER_V6);
        if (st.usingV6) {
            ui.sub.textContent = 'Mozilla PDF.js v6 \u00B7 official \u00B7 customized for Arcade Hub';
        } else if (page === VIEWER_V3) {
            ui.sub.textContent = 'Mozilla PDF.js v3.11 \u00B7 official \u00B7 maximum compatibility';
        } else {
            ui.sub.textContent = 'Mozilla PDF.js \u00B7 official viewer';
        }

        ui.frame.onload = function () {
            hookViewer(ui.frame.contentWindow, st.lastCleanName,
                       st.lastOpts && st.lastOpts.downloadUrl);
            // Safety net: if the event hook can't run (sandboxed preview),
            // still hide our message once the viewer is up.
            setTimeout(hideMsg, 4500);
        };
        ui.frame.src = page + '?file=' + encodeURIComponent(st.blobUrl);

        // Arm the watchdog for any page that isn't the guaranteed v3 build.
        if (page !== VIEWER_V3 && !st.fellBack) {
            if (st.watchdog) clearTimeout(st.watchdog);
            st.watchdog = setTimeout(function () {
                st.watchdog = null;
                if (!st.visible || st.docLoaded || st.page === VIEWER_V3) return;
                try {
                    var app = ui.frame.contentWindow && ui.frame.contentWindow.PDFViewerApplication;
                    if (app && app.initialized) return;   // just slow — keep waiting
                } catch (e) { /* cross-origin → treat as failed */ }
                st.fellBack = true;
                showMsg('Switching to the <b>compatible viewer</b>&hellip;',
                        'this browser can\u2019t run that viewer \u00B7 same PDF, no re-download');
                launchViewer(VIEWER_V3);
            }, 9000);
        } else {
            if (st.watchdog) { clearTimeout(st.watchdog); st.watchdog = null; }
        }
    }

    function open(opts) {
        st.lastOpts = opts;
        buildUI();

        /* ---- file:// (site opened straight from disk) -------------------
           The embedded modal is impossible there: blob: URLs cannot cross
           opaque origins. BUT the official v3 viewer itself runs fine from
           disk, and its own validateFileURL whitelist ("null" origin) lets
           it fetch CORS-enabled https URLs directly — so we hand the PDF to
           the standalone viewer in a new tab instead. */
        if (location.protocol === 'file:') {
            st.visible = true;
            ui.root.classList.add('ahpdf-on');
            setProgress(1, false);
            if (opts.url) {
                window.open(VIEWER_V3 + '?file=' + encodeURIComponent(opts.url), '_blank');
                showMsg('Opened in the <b>standalone viewer</b> (new tab)',
                        'the embedded modal needs a web server &middot; run <b>python -m http.server</b> to unlock it');
            } else {
                window.open(VIEWER_V3, '_blank');
                showMsg('Standalone viewer opened (new tab)',
                        'use its <b>Open file</b> button there to pick a PDF from this device');
            }
            setTimeout(function () { if (st.visible && !st.docLoaded) hide(); }, 3000);
            return;
        }

        // (Re)start: abort any previous load and clean up its blob.
        var wasVisible = st.visible;
        if (wasVisible) resetState();
        st.visible = true;
        st.fellBack = false;
        st.docLoaded = false;
        ui.root.classList.add('ahpdf-on');

        var cleanName = sanitizeName(opts.name);
        st.lastCleanName = cleanName;
        ui.name.textContent = cleanName;

        if (!st.pushed) {
            try { history.pushState({ ahpdf: true }, ''); st.pushed = true; } catch (e) {}
        }

        var bufPromise;
        if (opts.arrayBuffer) {
            setProgress(1, false);
            showMsg('Opening <b>' + cleanName + '</b>&hellip;', '');
            bufPromise = Promise.resolve(opts.arrayBuffer);
        } else if (opts.url) {
            showMsg('Connecting&hellip;', 'Downloading from Google Drive');
            setProgress(0, true);
            st.abort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            bufPromise = fetchPdf(opts.url, function (frac, got, total) {
                if (frac >= 0) {
                    /* known size → FIXED bar filling left-to-right + real numbers */
                    setProgress(frac, false);
                    showMsg('Downloading <b>' + cleanName + '</b>&hellip;',
                        mb(got) + ' of ' + mb(total) + ' &middot; ' + Math.round(frac * 100) + '%');
                } else {
                    /* size unknown → looping bar (a fixed % is impossible) */
                    setProgress(0, true);
                    showMsg('Downloading <b>' + cleanName + '</b>&hellip;',
                        mb(got) + ' downloaded&hellip;');
                }
            }, st.abort && st.abort.signal, opts.totalBytes).catch(function (err) {
                if (err && err.name === 'AbortError') throw err;
                throw new Error('Download failed — ' +
                    (navigator.onLine === false
                        ? 'you are offline. Check your internet and try again.'
                        : (err.message || 'network error')));
            });
        } else {
            showError('No PDF source given.');
            return;
        }

        bufPromise.then(function (buf) {
            if (!st.visible) return;                       // closed meanwhile
            if (!buf || !buf.byteLength) throw new Error('The file is empty.');

            st.blobUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));

            /* Viewer/engine load: no percentage possible here → looping bar. */
            setProgress(0, true);
            var page = resolveViewerPage();
            if (page === VIEWER_V6 && !st.fellBack) {
                showMsg('Loading <b>Mozilla PDF.js v6</b>&hellip;',
                        'official viewer, customized for Arcade Hub &middot; cached after first open');
            } else {
                showMsg('Loading <b>Mozilla PDF.js</b>&hellip;',
                        'official viewer &middot; maximum-compatibility build');
            }
            launchViewer(page);
        }).catch(function (err) {
            if (err && err.name === 'AbortError') return;   // replaced by a newer open()
            if (!st.visible) return;
            showError(err.message || 'Unknown error while loading the PDF.');
        });
    }

    window.ArcadePDFOpen = {
        open: open,
        close: close,
        setViewerPage: setViewerPage,
        whichViewer: function () { return st.usingV6 ? 'v6' : 'v3'; }
    };
})();
