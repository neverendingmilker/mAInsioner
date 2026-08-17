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
  // ROW_UNIT is only used to (a) convert an old saved rowSpan into an equivalent pixel
  // height the first time a browser loads this new version, and (b) estimate how many
  // grid row-tracks a free-height card needs to reserve for layout bookkeeping (see
  // repositionAll). Column width is measured live instead (colWidth below), since it
  // depends on the chosen column count.
  var ROW_UNIT = 140;
  var GAP = 24;
  var MIN_HEIGHT_PX = ROW_UNIT;
  var MAX_HEIGHT_PX = ROW_UNIT * 6 + GAP * 5; // same ceiling the old 6-row cap gave
  var SNAP_THRESHOLD_PX = 14; // how close to a neighbor's edge before it snaps to match it
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

    function readColSpan(card) {
      return parseInt(card.getAttribute('data-col-span') || String(COLS), 10);
    }

    function applyColSpan(card, colSpan) {
      colSpan = clamp(Math.round(colSpan), 1, COLS);
      card.setAttribute('data-col-span', String(colSpan));
    }

    // Height (in px) is only ever set on a card that's actually been dragged taller/shorter
    // at some point — null means "never resized," i.e. keep the natural CSS height (one row,
    // sized to content). Unlike colSpan there's no default to fall back on: forcing every
    // untouched card to MIN_HEIGHT_PX the moment this ran would shrink normal-content cards
    // that just happen to render taller than one row.
    function readHeightPx(card) {
      var stored = card.getAttribute('data-height-px');
      return stored ? clamp(parseFloat(stored), MIN_HEIGHT_PX, MAX_HEIGHT_PX) : null;
    }

    function applyHeightPx(card, heightPx) {
      heightPx = clamp(heightPx, MIN_HEIGHT_PX, MAX_HEIGHT_PX);
      card.setAttribute('data-height-px', String(Math.round(heightPx)));
      card.style.height = heightPx + 'px';
      return heightPx;
    }

    // Explicitly places every card (column-start AND row-start, not just a span) instead
    // of leaving it to the grid's own auto-placement. Auto-placement (even "dense") packs
    // strictly in DOM order and can't tell that a card is *meant* to stand next to a
    // group — e.g. one tall card meant to sit beside three stacked short ones would often
    // get "used" to patch an earlier gap instead, depending on exactly where it fell in
    // the list, and different numbers of cards per column (this one's whole point) just
    // wasn't reliably achievable. This walks the cards in their current DOM order and
    // always drops the next one into whichever column(s) it fits into earliest — the same
    // "shortest column first" rule a masonry layout uses — so a column naturally ends up
    // with as many or as few cards as their actual sizes call for, and it holds regardless
    // of *where* in the list a resized card happens to be, not just one exact position.
    function repositionAll() {
      var colRow = [];
      for (var c = 0; c < COLS; c++) colRow.push(1);

      var cards = list.querySelectorAll('.panel[data-card-id]');
      for (var i = 0; i < cards.length; i++) {
        var colSpan = clamp(readColSpan(cards[i]), 1, COLS);
        var heightPx = readHeightPx(cards[i]);
        // Bookkeeping only — how many row-tracks to reserve so nothing overlaps. The
        // card's actual rendered height comes from its own explicit inline height (or,
        // for a never-resized card, natural content height); this is just an estimate of
        // how much vertical room that takes up in the shared column grid.
        var rowSpan = heightPx === null ? 1 : Math.max(1, Math.ceil((heightPx + GAP) / (ROW_UNIT + GAP)));

        var bestCol = 0;
        var bestStart = Infinity;
        for (var start = 0; start <= COLS - colSpan; start++) {
          var neededRow = 1;
          for (var k = start; k < start + colSpan; k++) neededRow = Math.max(neededRow, colRow[k]);
          if (neededRow < bestStart) {
            bestStart = neededRow;
            bestCol = start;
          }
        }

        cards[i].style.gridColumn = (bestCol + 1) + ' / span ' + colSpan;
        cards[i].style.gridRow = bestStart + ' / span ' + rowSpan;
        for (var k2 = bestCol; k2 < bestCol + colSpan; k2++) colRow[k2] = bestStart + rowSpan;
      }
    }

    function currentSizes() {
      var result = {};
      var cards = list.querySelectorAll('.panel[data-card-id]');
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        result[c.getAttribute('data-card-id')] = { colSpan: readColSpan(c), heightPx: readHeightPx(c) };
      }
      return result;
    }

    // Apply saved per-card grid spans. Every card defaults to a full-width single row
    // purely from CSS (see .card-list .panel's "grid-column: 1 / -1"), so a page nobody has
    // ever resized needs none of this; it only overrides cards that have an explicit saved
    // span. Already clamped to the current column count via applyColSpan above.
    var savedSizes = readJSON(sizeKey, {});
    if (!savedSizes || typeof savedSizes !== 'object') savedSizes = {};
    var cardsForSize = list.querySelectorAll('.panel[data-card-id]');
    for (var s = 0; s < cardsForSize.length; s++) {
      var cardEl = cardsForSize[s];
      var cid = cardEl.getAttribute('data-card-id');
      var sz = savedSizes[cid];
      if (!sz) continue;
      if (typeof sz.colSpan === 'number') applyColSpan(cardEl, sz.colSpan);
      if (typeof sz.heightPx === 'number') {
        applyHeightPx(cardEl, sz.heightPx);
      } else if (typeof sz.rowSpan === 'number') {
        // Saved by a browser running the old stepped-rowSpan version — convert it to the
        // equivalent pixel height once so existing layouts don't visually reset the first
        // time this version loads. From then on it's stored as heightPx like any other.
        applyHeightPx(cardEl, sz.rowSpan * ROW_UNIT + (sz.rowSpan - 1) * GAP);
      }
    }
    // Every card needs an explicit position, not just the ones with a saved size — this is
    // also what places a never-resized page's cards (all still full-width/one-row) one per
    // row, same look as before any of this existed.
    repositionAll();

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
              applyColSpan(cardsNow[n], COLS);
              sizes[id] = { colSpan: COLS, heightPx: typeof savedSz.heightPx === 'number' ? savedSz.heightPx : null };
              changed = true;
            }
          }
          if (changed) writeJSON(sizeKey, sizes);
        }

        // Column count changes where every card lands, not just the ones that got
        // clamped above.
        repositionAll();
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
      grip.title = 'Trascina per ridimensionare (larghezza a step, altezza libera — avvicinati al bordo di una card vicina per agganciarti)';
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

    // Dragging the grip drives two independent axes differently on purpose. Width still
    // moves in whole-column steps (dx snapped to the grid's own column width) — CSS Grid's
    // equal-width (1fr) columns don't support arbitrary fractional widths without a much
    // bigger redesign. Height instead follows the cursor 1:1, completely free — the only
    // "snapping" is magnetic: if the card's bottom edge lands close to another visible
    // card's bottom edge, it locks onto that exact edge so matching a neighbor's height
    // doesn't require pixel-perfect dragging. That snap is recomputed from scratch on every
    // single mousemove from the raw cursor position (never carried over from the previous
    // move), so continuing to drag past the snap threshold releases it immediately and goes
    // back to following the cursor — there's no accumulated state that could leave a card
    // stuck unable to shrink or grow further.
    function startCardResize(card, startEvent) {
      var startX = startEvent.clientX;
      var startY = startEvent.clientY;
      var startColSpan = readColSpan(card);
      var startHeightPx = readHeightPx(card);
      if (startHeightPx === null) {
        // Never explicitly resized yet — start from whatever height it's actually
        // rendering at right now, so the first drag follows the cursor from there instead
        // of jumping straight to MIN_HEIGHT_PX.
        startHeightPx = clamp(card.getBoundingClientRect().height, MIN_HEIGHT_PX, MAX_HEIGHT_PX);
      }
      var listRect = list.getBoundingClientRect();
      var colWidth = (listRect.width - GAP * (COLS - 1)) / COLS;
      card.classList.add('card-resizing');

      function onMove(e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;

        var deltaCols = Math.round(dx / (colWidth + GAP));
        applyColSpan(card, startColSpan + deltaCols);

        // Read the card's current top edge fresh (reflects the layout as of the last
        // completed reposition) before touching its height, so the snap comparison below
        // is always against up-to-date geometry.
        var cardTop = card.getBoundingClientRect().top;
        var rawHeight = clamp(startHeightPx + dy, MIN_HEIGHT_PX, MAX_HEIGHT_PX);
        var proposedBottom = cardTop + rawHeight;

        var snappedHeight = null;
        var bestDelta = SNAP_THRESHOLD_PX;
        var others = list.querySelectorAll('.panel[data-card-id]');
        for (var i = 0; i < others.length; i++) {
          if (others[i] === card) continue;
          var otherBottom = others[i].getBoundingClientRect().bottom;
          var delta = Math.abs(otherBottom - proposedBottom);
          if (delta < bestDelta) {
            bestDelta = delta;
            snappedHeight = clamp(otherBottom - cardTop, MIN_HEIGHT_PX, MAX_HEIGHT_PX);
          }
        }

        applyHeightPx(card, snappedHeight !== null ? snappedHeight : rawHeight);

        // Resizing this one card can change where every other card lands too (a column it
        // now takes more/less of, or the row-track bookkeeping used for layout), so the
        // whole layout is recomputed live as you drag, not just this card's own box.
        repositionAll();
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
        // New DOM order can land cards in different columns entirely, live as you drag.
        repositionAll();
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
