// Vanilla-JS drag-and-drop reordering, drag-to-resize, and column-count support for the
// "cards" (panel sections) on a feature page, no dependencies — same drag-reorder technique
// as qotdReorder.js/themesReorder.js, plus a "Reorder" switch gating whether dragging/
// resizing is possible at all (off by default, so browsing a feature page never risks an
// accidental change). This is the standard for every feature page's #card-list, current and
// future — nothing here is Anime-Night-specific (it was only ever piloted there before being
// made the default for every page).
//
// Everything here — order, per-card grid span, and column count — lives in this browser's
// own localStorage, keyed by feature, never sent to the server. That's deliberate: the user
// explicitly didn't want their card layout shared across the whole server, where another
// Admin could change what everyone sees. Reorder and resize stay Admin-only (only an Admin
// gets the "Reorder" switch — see featureToggle.ejs), but column count is a personal viewing
// preference with no such restriction: it works the same for a Mod as for an Admin, entirely
// client-side.
(function () {
  // Included from partials/featureToggle.ejs, which every view renders near the TOP of the
  // page (inside .page-header) — well before the #card-list markup further down. Without
  // waiting for DOMContentLoaded, this script would run immediately on <script> parse, find
  // no #card-list yet, and bail out silently (the bug that shipped initially: the switch
  // existed in the DOM but nothing was ever wired up to it).
  document.addEventListener('DOMContentLoaded', init);

  // Must match public/style.css's `.card-list { grid-auto-rows: minmax(140px, auto) }` —
  // used only to translate a resize drag's pixel delta into a row count, not to size
  // anything itself (the grid's own CSS does that). A row can render taller than this if
  // its content needs it to, so the row math below is a snapping approximation, not a
  // pixel-exact measurement. Column width is measured live instead (colWidth below), since
  // it now depends on the chosen column count.
  var ROW_UNIT = 140;
  var GAP = 24;
  var MAX_ROW_SPAN = 6;
  var MIN_COLS = 1;
  var MAX_COLS = 3;
  var DEFAULT_COLS = 3;
  var STORAGE_PREFIX = 'mainsioner:cardLayout:';

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Storage disabled, full, or blocked (private browsing etc.) — skip persisting; the
      // DOM already reflects the change for the rest of this page view either way.
    }
  }

  // Purely a localStorage namespace — does NOT need to match the server's own feature key
  // (see sidebarData.js's getFeatureKeyForPath, which even uses a different spelling for
  // some pages, e.g. "boosterlink" vs. this page's "/boosterlinks"). Deriving it straight
  // from the URL means this works identically for Admin and Mod sessions, with no server
  // local needed — unlike `currentFeatureKey`, which stays deliberately null for a Mod
  // (see requireAdmin.js) since it also names Admin-only form routes.
  function currentFeatureKey() {
    var seg = (location.pathname.split('/')[1] || '').toLowerCase();
    return seg || 'root';
  }

  function init() {
    var list = document.getElementById('card-list');
    if (!list) return;

    var featureKey = currentFeatureKey();
    var orderKey = STORAGE_PREFIX + featureKey + ':order';
    var sizeKey = STORAGE_PREFIX + featureKey + ':size';
    var colsKey = STORAGE_PREFIX + featureKey + ':cols';

    // --- Column count (1, 2, or 3 — everyone's, not just Admin's) ---
    var COLS = clamp(parseInt(readJSON(colsKey, DEFAULT_COLS), 10) || DEFAULT_COLS, MIN_COLS, MAX_COLS);
    list.style.setProperty('--card-cols', String(COLS));

    var savedOrder = readJSON(orderKey, []);
    if (!Array.isArray(savedOrder)) savedOrder = [];

    // Apply the saved order immediately: cards named in it move to the front in that order;
    // any card not mentioned (a brand-new one, or one never explicitly moved) keeps its
    // original relative position, effectively appended after the ones that were moved.
    if (savedOrder.length > 0) {
      var byId = {};
      var cards = list.querySelectorAll('.panel[data-card-id]');
      for (var i = 0; i < cards.length; i++) byId[cards[i].getAttribute('data-card-id')] = cards[i];
      for (var j = 0; j < savedOrder.length; j++) {
        var card = byId[savedOrder[j]];
        if (card) list.appendChild(card);
      }
    }

    function readSpan(card) {
      return {
        colSpan: parseInt(card.getAttribute('data-col-span') || String(COLS), 10),
        rowSpan: parseInt(card.getAttribute('data-row-span') || '1', 10),
      };
    }

    function applySpan(card, colSpan, rowSpan) {
      colSpan = clamp(Math.round(colSpan), 1, COLS);
      rowSpan = clamp(Math.round(rowSpan), 1, MAX_ROW_SPAN);
      card.style.gridColumn = 'span ' + colSpan;
      card.style.gridRow = 'span ' + rowSpan;
      card.setAttribute('data-col-span', String(colSpan));
      card.setAttribute('data-row-span', String(rowSpan));
    }

    function currentSizes() {
      var result = {};
      var cards = list.querySelectorAll('.panel[data-card-id]');
      for (var i = 0; i < cards.length; i++) {
        result[cards[i].getAttribute('data-card-id')] = readSpan(cards[i]);
      }
      return result;
    }

    // Apply saved per-card grid spans. Every card defaults to a full-width single row
    // purely from CSS (see .card-list .panel's "grid-column: 1 / -1"), so a page nobody has
    // ever resized needs none of this; it only overrides cards that have an explicit saved
    // span. Already clamped to the current column count via applySpan above.
    var savedSizes = readJSON(sizeKey, {});
    if (!savedSizes || typeof savedSizes !== 'object') savedSizes = {};
    var cardsForSize = list.querySelectorAll('.panel[data-card-id]');
    for (var s = 0; s < cardsForSize.length; s++) {
      var cid = cardsForSize[s].getAttribute('data-card-id');
      var sz = savedSizes[cid];
      if (sz && typeof sz.colSpan === 'number' && typeof sz.rowSpan === 'number') {
        applySpan(cardsForSize[s], sz.colSpan, sz.rowSpan);
      }
    }

    // --- Column count control (radio pair in featureToggle.ejs, no role restriction) ---
    var colsRadios = document.querySelectorAll('input[name="card-cols"]');
    for (var cr = 0; cr < colsRadios.length; cr++) {
      colsRadios[cr].checked = parseInt(colsRadios[cr].value, 10) === COLS;
      colsRadios[cr].addEventListener('change', function (e) {
        if (!e.target.checked) return;
        var newCols = clamp(parseInt(e.target.value, 10), MIN_COLS, MAX_COLS);
        COLS = newCols;
        list.style.setProperty('--card-cols', String(COLS));
        writeJSON(colsKey, COLS);

        // Only clamp cards that already have an explicit saved span oversized for the new
        // column count — a card with no saved span at all stays on the CSS default
        // (full-width, "1 / -1"), which already adapts to any column count on its own.
        var sizes = readJSON(sizeKey, {});
        if (sizes && typeof sizes === 'object') {
          var changed = false;
          var cardsNow = list.querySelectorAll('.panel[data-card-id]');
          for (var n = 0; n < cardsNow.length; n++) {
            var id = cardsNow[n].getAttribute('data-card-id');
            var savedSz = sizes[id];
            if (savedSz && typeof savedSz.colSpan === 'number' && savedSz.colSpan > COLS) {
              applySpan(cardsNow[n], COLS, savedSz.rowSpan);
              sizes[id] = { colSpan: COLS, rowSpan: savedSz.rowSpan };
              changed = true;
            }
          }
          if (changed) writeJSON(sizeKey, sizes);
        }
      });
    }

    // --- Drag-reorder + drag-resize (Admin-only — see featureToggle.ejs) ---
    var lockSwitch = document.getElementById('card-lock-btn');
    if (!lockSwitch) return;

    var dragged = null;
    var unlocked = false;
    // Set on any drop while unlocked, so re-locking the switch only actually writes to
    // localStorage if something was really moved — flipping it back off without having
    // dragged anything is a no-op.
    var moved = false;
    // Snapshot of every card's column/row span taken the moment reorder mode turns on,
    // compared against the current spans when it turns back off — same "only save if
    // something actually changed" behavior as `moved` above, but for resize instead of drag.
    var sizesAtLockStart = {};

    function currentOrderIds() {
      var cards = list.querySelectorAll('.panel[data-card-id]');
      var ids = [];
      for (var i = 0; i < cards.length; i++) ids.push(cards[i].getAttribute('data-card-id'));
      return ids;
    }

    function setDraggable(on) {
      var cards = list.querySelectorAll('.panel[data-card-id]');
      for (var i = 0; i < cards.length; i++) cards[i].setAttribute('draggable', on ? 'true' : 'false');
    }

    function addHandle(card) {
      if (card.querySelector('.card-drag-handle')) return;
      var handle = document.createElement('span');
      handle.className = 'card-drag-handle';
      handle.title = 'Trascina per riordinare';
      handle.textContent = '⠿';
      card.insertBefore(handle, card.firstChild);
    }

    function removeHandles() {
      var handles = list.querySelectorAll('.card-drag-handle');
      for (var i = 0; i < handles.length; i++) handles[i].parentNode.removeChild(handles[i]);
    }

    function addResizeGrip(card) {
      if (card.querySelector('.card-resize-grip')) return;
      var grip = document.createElement('span');
      grip.className = 'card-resize-grip';
      grip.title = 'Trascina per ridimensionare (colonne/righe)';
      grip.addEventListener('mousedown', function (e) {
        if (!unlocked) return;
        e.preventDefault();
        e.stopPropagation();
        startCardResize(card, e);
      });
      card.appendChild(grip);
    }

    function removeResizeGrips() {
      var grips = list.querySelectorAll('.card-resize-grip');
      for (var i = 0; i < grips.length; i++) grips[i].parentNode.removeChild(grips[i]);
    }

    // Grid spans (integers) don't respond to the native CSS `resize` property, so dragging
    // the grip is handled entirely here: track the mouse, convert how far it's moved into a
    // column/row count using the grid's own current column width (ROW_UNIT for rows, since
    // rows are auto-sized to content and have no single fixed pixel height to measure), and
    // snap the card's span to that as you go — same interaction shape as a native resize
    // handle, just quantized to whole grid cells instead of following the cursor 1:1. This
    // stays step/snapped (not free pixel resize) on purpose, regardless of column count.
    function startCardResize(card, startEvent) {
      var startX = startEvent.clientX;
      var startY = startEvent.clientY;
      var start = readSpan(card);
      var listRect = list.getBoundingClientRect();
      var colWidth = (listRect.width - GAP * (COLS - 1)) / COLS;
      card.classList.add('card-resizing');

      function onMove(e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var deltaCols = Math.round(dx / (colWidth + GAP));
        var deltaRows = Math.round(dy / (ROW_UNIT + GAP));
        applySpan(card, start.colSpan + deltaCols, start.rowSpan + deltaRows);
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        card.classList.remove('card-resizing');
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    var initialCards = list.querySelectorAll('.panel[data-card-id]');
    for (var k = 0; k < initialCards.length; k++) attachHandlers(initialCards[k]);

    function attachHandlers(card) {
      card.addEventListener('dragstart', function (e) {
        if (!unlocked) {
          e.preventDefault();
          return;
        }
        dragged = card;
        card.classList.add('card-dragging');
      });

      card.addEventListener('dragend', function () {
        if (!unlocked) return;
        card.classList.remove('card-dragging');
        dragged = null;
        // Just marks the order dirty — does NOT save. Saving only happens when the user
        // flips the switch back off, so moving several cards in a row doesn't write to
        // localStorage after every single drop.
        moved = true;
      });

      card.addEventListener('dragover', function (e) {
        if (!unlocked || !dragged || dragged === card) return;
        e.preventDefault();
        var rect = card.getBoundingClientRect();
        var after = e.clientY - rect.top > rect.height / 2;
        list.insertBefore(dragged, after ? card.nextSibling : card);
      });
    }

    // Plain client-side mode toggle, same fixed-label convention as the Admin only/Edit
    // switches above — but unlike those, this one is NOT wired to submit its own form on
    // every change (there's no persisted "is this feature in reorder mode" boolean). It only
    // ever writes to localStorage when flipped back OFF after something was actually
    // dragged or resized.
    lockSwitch.addEventListener('change', function () {
      // Switched ON: enter edit mode, nothing to save yet.
      if (lockSwitch.checked) {
        unlocked = true;
        moved = false;
        setDraggable(true);
        list.classList.add('reorder-mode');
        sizesAtLockStart = currentSizes();
        var cards = list.querySelectorAll('.panel[data-card-id]');
        for (var i = 0; i < cards.length; i++) {
          addHandle(cards[i]);
          addResizeGrip(cards[i]);
        }
        return;
      }

      // Switched OFF: this is the only moment a new order/size gets saved, and only if
      // something was actually dragged or resized. No page reload needed anymore — the DOM
      // already reflects the change, localStorage is just catching up to it.
      unlocked = false;
      setDraggable(false);
      list.classList.remove('reorder-mode');
      removeHandles();
      removeResizeGrips();
      var sizesNow = currentSizes();
      var resized = JSON.stringify(sizesNow) !== JSON.stringify(sizesAtLockStart);
      if (moved) writeJSON(orderKey, currentOrderIds());
      if (resized) writeJSON(sizeKey, sizesNow);
    });
  }
})();
