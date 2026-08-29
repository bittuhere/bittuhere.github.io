/* ============================================================================
   Arcade Hub — customization layer for the official PDF.js v6 viewer
   ----------------------------------------------------------------------------
   Loaded by viewer.html BEFORE viewer.mjs (see the <script> tag in <head>).
   Built by tools/build_pdfjs6.py.

   1. TOOLBAR BUTTONS REMOVED FROM viewer.html
      Highlight, comment, text, draw, image and signature editors, print,
      save and the whole Tools menu were removed from the toolbar HTML.
      viewer.mjs (unmodified except one defaultUrl string) looks those
      elements up with document.getElementById() and binds listeners
      WITHOUT null checks — with the elements simply gone it would crash
      on boot. So for every removed id we return an invisible, detached
      placeholder element: the viewer binds its listeners to the
      placeholders and runs perfectly; the buttons just don't exist in
      the UI.

   2. DEFAULT DOCUMENT
      Opened without a ?file= parameter the viewer would load Mozilla's
      sample PDF. We rewrite the URL to load OUR demo PDF
      (arcade-demo.pdf) instead. viewer.mjs's defaultUrl is patched to
      the same file as well, so this works even where
      history.replaceState() is unavailable (e.g. file://).
   ============================================================================ */
(function () {
  'use strict';

  /* Every id that was removed from the toolbar in viewer.html */
  var REMOVED_IDS = [
    "addSignatureDoorHanger",
    "cursorHandTool",
    "cursorSelectTool",
    "cursorToolButtons",
    "documentProperties",
    "downloadButton",
    "editorComment",
    "editorCommentButton",
    "editorCommentParamsToolbar",
    "editorCommentsSidebar",
    "editorCommentsSidebarCloseButton",
    "editorCommentsSidebarCount",
    "editorCommentsSidebarHeader",
    "editorCommentsSidebarList",
    "editorCommentsSidebarListContainer",
    "editorCommentsSidebarResizer",
    "editorCommentsSidebarTitle",
    "editorFreeHighlightThickness",
    "editorFreeText",
    "editorFreeTextButton",
    "editorFreeTextColor",
    "editorFreeTextFontSize",
    "editorFreeTextParamsToolbar",
    "editorHighlight",
    "editorHighlightButton",
    "editorHighlightColorPicker",
    "editorHighlightParamsToolbar",
    "editorHighlightShowAll",
    "editorHighlightThickness",
    "editorHighlightVisibility",
    "editorInk",
    "editorInkButton",
    "editorInkColor",
    "editorInkOpacity",
    "editorInkParamsToolbar",
    "editorInkThickness",
    "editorModeButtons",
    "editorModeSeparator",
    "editorSignature",
    "editorSignatureAddSignature",
    "editorSignatureButton",
    "editorSignatureParamsToolbar",
    "editorStamp",
    "editorStampAddImage",
    "editorStampButton",
    "editorStampParamsToolbar",
    "firstPage",
    "highlightColorPickerLabel",
    "highlightParamsToolbarContainer",
    "imageAltTextSettings",
    "imageAltTextSettingsSeparator",
    "lastPage",
    "pageRotateCcw",
    "pageRotateCw",
    "presentationMode",
    "printButton",
    "scrollHorizontal",
    "scrollModeButtons",
    "scrollPage",
    "scrollVertical",
    "scrollWrapped",
    "secondaryDownload",
    "secondaryOpenFile",
    "secondaryPrint",
    "secondaryToolbar",
    "secondaryToolbarButtonContainer",
    "secondaryToolbarToggle",
    "secondaryToolbarToggleButton",
    "signatureProperties",
    "signaturePropertiesBanner",
    "signaturePropertiesButton",
    "signaturePropertiesContainer",
    "signaturePropertiesList",
    "signaturePropertiesPanel",
    "signaturePropertiesSeparator",
    "spreadEven",
    "spreadModeButtons",
    "spreadNone",
    "spreadOdd",
    "toolbarViewerRight",
    "viewBookmark",
    "viewBookmarkSeparator"
  ];

  /* Detached parent so code that reads button.parentElement still works
     (viewer.mjs does: editorCommentButton.parentElement.hidden = false). */
  var graveyard = document.createElement('div');
  var placeholders = Object.create(null);
  var realById = document.getElementById.bind(document);

  document.getElementById = function (id) {
    var el = realById(id);
    if (el !== null || REMOVED_IDS.indexOf(id) === -1) {
      return el;
    }
    var p = placeholders[id];
    if (!p) {
      p = document.createElement('button');
      p.type = 'button';
      p.setAttribute('aria-hidden', 'true');
      p.setAttribute('data-arcade-placeholder', id);
      graveyard.appendChild(p);
      placeholders[id] = p;
    }
    return p;
  };

  /* No ?file= given -> load the Arcade Hub demo PDF by default. */
  try {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      var u = new URL(location.href);
      if (!u.searchParams.has('file')) {
        u.searchParams.set('file', 'arcade-demo.pdf');
        history.replaceState(null, '', u.href);
      }
    }
  } catch (e) { /* viewer.mjs defaultUrl patch has us covered */ }
})();
