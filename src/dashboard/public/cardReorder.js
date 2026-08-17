// Vanilla-JS drag-and-drop reordering, drag-to-resize (multi-column span + free height),
// and column-count support for the "cards" (panel sections) on a feature page. No
// dependencies, no build step — same as every other public/*.js file in this dashboard.
// This is the standard for every feature page's #card-list, current and future: any view
// with `<div class="card-list" id="card-list">` wrapping `.panel[data-card-id]` sections
// gets reordering/resizing/column-count automatically, just by including
// partials/featureToggle.ejs (which also loads this file).
//
// --- What this file owns ---
// 1. A CSS Grid masonry layout (grid.reposition): cards can span 1..COLS columns and any
//    pixel height, placed via a "shortest column first" rule so the grid never has to fall
//    back to the browser's own auto-placement — every column always ends up exactly as
//    full as its cards make it, with no leftover gaps and no risk of a tall card landing
//    next to the wrong group depending on DOM order.
// 2. Drag-and-drop reordering (dragController): moving a card's DOM position and letting
//    the grid re-flow live, at up to one recompute per animation frame so a fast drag never
//    piles up redundant layout work.
// 3. Drag-to-resize (resizeController): width in whole-column steps (CSS Grid's equal-width
//    columns can't do fractional widths), height completely free with a magnetic snap to a
//    neighboring card's edge that releases itself the moment you keep dragging past it — a
//    card can never get stuck at a size you can't change further.
// 4. Persistence: order, per-card size, and column count all live in *this browser's own*
//    localStorage, keyed by feature — never sent to the server. Reorder/resize are
//    Admin-only (gated by whether #card-lock-btn exists at all — see featureToggle.ejs);
//    column count is a personal viewing preference open to Admin and Mod alike.
(function () {
  'use strict';

  var CONFIG = {
    // Must match style.css's `.card-list { grid-auto-rows: minmax(140px, auto) }`. Used to
    // (a) convert an old saved rowSpan into an equivalent pixel height the first time a
    // browser loads a version of this file that has free height instead, and (b) estimate
    // how many grid row-tracks a free-height card needs to reserve for layout bookkeeping.
    rowUnit: 140,
    gap: 24,
    minCols: 1,
    maxCols: 3,
    defaultCols: 3,
    // How close (in px) a card's dragged-to bottom edge needs to land to another visible
    // card's bottom edge before it magnetically snaps to match it exactly.
    snapThresholdPx: 14,
    storagePrefix: 'mainsioner:cardLayout:',
  };
  CONFIG.minHeightPx = CONFIG.rowUnit;
  CONFIG.maxHeightPx = CONFIG.rowUnit * 6 + CONFIG.gap * 5; // same ceiling the old 6-row cap gave

  document.addEventListener('DOMContentLoaded', init);

  // ---------------------------------------------------------------------------------------
  // Small generic helpers
  // ---------------------------------------------------------------------------------------

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
  // local needed.
  function currentFeatureKey() {
    var seg = (location.pathname.split('/')[1] || '').toLowerCase();
    return seg || 'root';
  }

  // Collapses any number of calls within the same animation frame into exactly one, running
  // with the arguments from the *last* call — used so a stream of dragover/mousemove events
  // (which can fire far faster than the browser paints) only ever triggers one masonry
  // recompute per frame instead of piling up redundant layout work behind the scenes.
  function rafThrottle(fn) {
    var scheduled = false;
    var pendingArgs = null;
    return function () {
      pendingArgs = arguments;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        fn.apply(null, pendingArgs);
      });
    };
  }

  function cardsOf(list) {
    return list.querySelectorAll('.panel[data-card-id]');
  }

  // ---------------------------------------------------------------------------------------
  // Grid engine: reading/writing each card's span, and the masonry placement algorithm.
  // Everything here is pure DOM + attribute manipulation, no event handling — the drag and
  // resize controllers further down are the only things that call into it.
  // ---------------------------------------------------------------------------------------

  function createGrid(list) {
    var cols = CONFIG.defaultCols;

    function setCols(n) {
      cols = clamp(n, CONFIG.minCols, CONFIG.maxCols);
      list.style.setProperty('--card-cols', String(cols));
    }

    function readColSpan(card) {
      return parseInt(card.getAttribute('data-col-span') || String(cols), 10);
    }

    function applyColSpan(card, colSpan) {
      colSpan = clamp(Math.round(colSpan), 1, cols);
      card.setAttribute('data-col-span', String(colSpan));
    }

    // Height (px) is only ever set on a card that's actually been dragged taller/shorter at
    // some point — null means "never resized," i.e. keep the natural CSS height (one row,
    // sized to content). Unlike colSpan there's no default to fall back on: forcing every
    // untouched card to minHeightPx the moment this runs would shrink normal-content cards
    // that just happen to render taller than one row.
    function readHeightPx(card) {
      var stored = card.getAttribute('data-height-px');
      return stored ? clamp(parseFloat(stored), CONFIG.minHeightPx, CONFIG.maxHeightPx) : null;
    }

    function applyHeightPx(card, heightPx) {
      heightPx = clamp(heightPx, CONFIG.minHeightPx, CONFIG.maxHeightPx);
      card.setAttribute('data-height-px', String(Math.round(heightPx)));
      card.style.height = heightPx + 'px';
      return heightPx;
    }

    // Explicitly places every card (column-start AND row-start, not just a span) instead of
    // leaving it to the grid's own auto-placement. Auto-placement (even "dense") packs
    // strictly in DOM order and can't tell that a card is *meant* to stand next to a
    // group — a tall card meant to sit beside three stacked short ones could get "used" to
    // patch an earlier gap instead, depending on exactly where it fell in the list, and
    // different numbers of cards per column just wasn't reliably achievable. This walks the
    // cards in their current DOM order and always drops the next one into whichever
    // column(s) it fits into earliest — the same "shortest column first" rule a masonry
    // layout uses — so every column always ends up exactly as tall as its own cards make
    // it, with no leftover/anomalous empty cells: each card is appended right after the
    // shortest point in its target column(s), never skipping ahead and leaving a hole.
    function reposition() {
      var colBottom = [];
      for (var c = 0; c < cols; c++) colBottom.push(1);

      var cards = cardsOf(list);
      for (var i = 0; i < cards.length; i++) {
        var colSpan = clamp(readColSpan(cards[i]), 1, cols);
        var heightPx = readHeightPx(cards[i]);
        // Bookkeeping only — how many row-tracks to reserve so nothing overlaps. The card's
        // actual rendered height comes from its own explicit inline height (or, for a
        // never-resized card, natural content height); this is just an estimate of how much
        // vertical room that takes up in the shared column grid.
        var rowSpan = heightPx === null ? 1 : Math.max(1, Math.ceil((heightPx + CONFIG.gap) / (CONFIG.rowUnit + CONFIG.gap)));

        var bestCol = 0;
        var bestStart = Infinity;
        for (var start = 0; start <= cols - colSpan; start++) {
          var neededRow = 1;
          for (var k = start; k < start + colSpan; k++) neededRow = Math.max(neededRow, colBottom[k]);
          if (neededRow < bestStart) {
            bestStart = neededRow;
            bestCol = start;
          }
        }

        cards[i].style.gridColumn = (bestCol + 1) + ' / span ' + colSpan;
        cards[i].style.gridRow = bestStart + ' / span ' + rowSpan;
        for (var k2 = bestCol; k2 < bestCol + colSpan; k2++) colBottom[k2] = bestStart + rowSpan;
      }
    }

    function currentOrder() {
      var cards = cardsOf(list);
      var ids = [];
      for (var i = 0; i < cards.length; i++) ids.push(cards[i].getAttribute('data-card-id'));
      return ids;
    }

    function currentSizes() {
      var result = {};
      var cards = cardsOf(list);
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        result[c.getAttribute('data-card-id')] = { colSpan: readColSpan(c), heightPx: readHeightPx(c) };
      }
      return result;
    }

    // Applies a saved {colSpan, heightPx} (or a legacy {colSpan, rowSpan}, migrated on the
    // fly to its pixel-height equivalent) to one card. Skips whatever isn't present, so a
    // partially-saved entry only overrides what it actually specifies.
    function applySize(card, sz) {
      if (!sz) return;
      if (typeof sz.colSpan === 'number') applyColSpan(card, sz.colSpan);
      if (typeof sz.heightPx === 'number') {
        applyHeightPx(card, sz.heightPx);
      } else if (typeof sz.rowSpan === 'number') {
        applyHeightPx(card, sz.rowSpan * CONFIG.rowUnit + (sz.rowSpan - 1) * CONFIG.gap);
      }
    }

    return {
      setCols: setCols,
      getCols: function () { return cols; },
      readColSpan: readColSpan,
      applyColSpan: applyColSpan,
      readHeightPx: readHeightPx,
      applyHeightPx: applyHeightPx,
      applySize: applySize,
      reposition: reposition,
      currentOrder: currentOrder,
      currentSizes: currentSizes,
    };
  }

  // ---------------------------------------------------------------------------------------
  // Drag-and-drop reordering. Native HTML5 DnD (draggable="true" + dragstart/dragover/
  // dragend), same technique as qotdReorder.js/themesReorder.js — dropping a card above or
  // below another moves it there in the DOM, and the grid re-flows live as you go.
  // ---------------------------------------------------------------------------------------

  function createDragController(grid, list) {
    var dragged = null;

    var scheduleReposition = rafThrottle(function () {
      grid.reposition();
    });

    function attach(card) {
      card.addEventListener('dragstart', function (e) {
        dragged = card;
        card.classList.add('card-dragging');
        if (e.dataTransfer) {
          // Firefox refuses to start a drag at all without data set on it; the value
          // itself is never read anywhere.
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', card.getAttribute('data-card-id') || '');
        }
      });

      card.addEventListener('dragend', function () {
        card.classList.remove('card-dragging');
        dragged = null;
      });

      card.addEventListener('dragover', function (e) {
        if (!dragged || dragged === card) return;
        e.preventDefault();
        var rect = card.getBoundingClientRect();
        var after = e.clientY - rect.top > rect.height / 2;
        list.insertBefore(dragged, after ? card.nextSibling : card);
        // New DOM order can land cards in different columns entirely — reflow live, but
        // batched to once per frame so a fast drag doesn't thrash layout.
        scheduleReposition();
      });
    }

    function enable() {
      var cards = cardsOf(list);
      for (var i = 0; i < cards.length; i++) {
        cards[i].setAttribute('draggable', 'true');
      }
    }

    function disable() {
      var cards = cardsOf(list);
      for (var i = 0; i < cards.length; i++) {
        cards[i].setAttribute('draggable', 'false');
      }
    }

    return { attach: attach, enable: enable, disable: disable };
  }

  // ---------------------------------------------------------------------------------------
  // Drag-to-resize. Width moves in whole-column steps (dx snapped to the grid's own column
  // width) — CSS Grid's equal-width (1fr) columns don't support arbitrary fractional widths
  // without a much bigger redesign. Height follows the cursor 1:1, completely free; the
  // only "snapping" is magnetic, to a neighboring card's bottom edge, and is recomputed
  // from the raw cursor position on every move (never carried over from the previous move),
  // so continuing to drag past the snap threshold releases it immediately — there's no
  // accumulated state that could leave a card stuck unable to shrink or grow further.
  // ---------------------------------------------------------------------------------------

  function createResizeController(grid, list) {
    function startResize(card, startEvent) {
      var startX = startEvent.clientX;
      var startY = startEvent.clientY;
      var startColSpan = grid.readColSpan(card);
      var startHeightPx = grid.readHeightPx(card);
      if (startHeightPx === null) {
        // Never explicitly resized yet — start from whatever height it's actually
        // rendering at right now, so the first drag follows the cursor from there instead
        // of jumping straight to the minimum height.
        startHeightPx = clamp(card.getBoundingClientRect().height, CONFIG.minHeightPx, CONFIG.maxHeightPx);
      }
      var listRect = list.getBoundingClientRect();
      var cols = grid.getCols();
      var colWidth = (listRect.width - CONFIG.gap * (cols - 1)) / cols;
      card.classList.add('card-resizing');

      var latestEvent = null;

      function apply() {
        var e = latestEvent;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;

        var deltaCols = Math.round(dx / (colWidth + CONFIG.gap));
        grid.applyColSpan(card, startColSpan + deltaCols);

        // Read the card's current top edge fresh (reflects the layout as of the last
        // completed reposition) before touching its height, so the snap comparison below
        // is always against up-to-date geometry.
        var cardTop = card.getBoundingClientRect().top;
        var rawHeight = clamp(startHeightPx + dy, CONFIG.minHeightPx, CONFIG.maxHeightPx);
        var proposedBottom = cardTop + rawHeight;

        var snappedHeight = null;
        var bestDelta = CONFIG.snapThresholdPx;
        var others = cardsOf(list);
        for (var i = 0; i < others.length; i++) {
          if (others[i] === card) continue;
          var otherBottom = others[i].getBoundingClientRect().bottom;
          var delta = Math.abs(otherBottom - proposedBottom);
          if (delta < bestDelta) {
            bestDelta = delta;
            snappedHeight = clamp(otherBottom - cardTop, CONFIG.minHeightPx, CONFIG.maxHeightPx);
          }
        }

        grid.applyHeightPx(card, snappedHeight !== null ? snappedHeight : rawHeight);

        // Resizing this one card can change where every other card lands too (a column it
        // now takes more/less of, or the row-track bookkeeping used for layout), so the
        // whole layout is recomputed live as you drag, not just this card's own box.
        grid.reposition();
      }

      var scheduleApply = rafThrottle(apply);

      function onMove(e) {
        latestEvent = e;
        scheduleApply();
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        card.classList.remove('card-resizing');
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function addGrip(card) {
      if (card.querySelector('.card-resize-grip')) return;
      var grip = document.createElement('span');
      grip.className = 'card-resize-grip';
      grip.title = 'Trascina per ridimensionare (larghezza a step, altezza libera — avvicinati al bordo di una card vicina per agganciarti)';
      grip.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        startResize(card, e);
      });
      card.appendChild(grip);
    }

    function removeGrips() {
      var grips = list.querySelectorAll('.card-resize-grip');
      for (var i = 0; i < grips.length; i++) grips[i].parentNode.removeChild(grips[i]);
    }

    return { addGrip: addGrip, removeGrips: removeGrips };
  }

  // ---------------------------------------------------------------------------------------
  // Wiring: load saved layout, apply it, and (Admin-only) hook up the Reorder switch that
  // turns dragging/resizing on and off.
  // ---------------------------------------------------------------------------------------

  function addDragHandle(card) {
    if (card.querySelector('.card-drag-handle')) return;
    var handle = document.createElement('span');
    handle.className = 'card-drag-handle';
    handle.title = 'Trascina per riordinare';
    handle.textContent = '⠿';
    card.insertBefore(handle, card.firstChild);
  }

  function removeDragHandles(list) {
    var handles = list.querySelectorAll('.card-drag-handle');
    for (var i = 0; i < handles.length; i++) handles[i].parentNode.removeChild(handles[i]);
  }

  function init() {
    var list = document.getElementById('card-list');
    if (!list) return;

    var featureKey = currentFeatureKey();
    var orderKey = CONFIG.storagePrefix + featureKey + ':order';
    var sizeKey = CONFIG.storagePrefix + featureKey + ':size';
    var colsKey = CONFIG.storagePrefix + featureKey + ':cols';

    var grid = createGrid(list);

    // --- Column count (1, 2, or 3 — everyone's, not just Admin's) ---
    grid.setCols(parseInt(readJSON(colsKey, CONFIG.defaultCols), 10) || CONFIG.defaultCols);

    // --- Apply the saved order: cards named in it move to the front in that order; any
    // card not mentioned (a brand-new one, or one never explicitly moved) keeps its
    // original relative position, effectively appended after the ones that were moved. ---
    var savedOrder = readJSON(orderKey, []);
    if (!Array.isArray(savedOrder)) savedOrder = [];
    if (savedOrder.length > 0) {
      var byId = {};
      var initialCardsForOrder = cardsOf(list);
      for (var i = 0; i < initialCardsForOrder.length; i++) {
        byId[initialCardsForOrder[i].getAttribute('data-card-id')] = initialCardsForOrder[i];
      }
      for (var j = 0; j < savedOrder.length; j++) {
        var card = byId[savedOrder[j]];
        if (card) list.appendChild(card);
      }
    }

    // --- Apply saved per-card sizes. Every card defaults to a full-width single row purely
    // from CSS, so a page nobody has ever resized needs none of this. ---
    var savedSizes = readJSON(sizeKey, {});
    if (!savedSizes || typeof savedSizes !== 'object') savedSizes = {};
    var cardsForSize = cardsOf(list);
    for (var s = 0; s < cardsForSize.length; s++) {
      grid.applySize(cardsForSize[s], savedSizes[cardsForSize[s].getAttribute('data-card-id')]);
    }

    // Every card needs an explicit position, not just the ones with a saved size — this is
    // also what places a never-resized page's cards (all still full-width/one-row) one per
    // row, same look as before any of this existed.
    grid.reposition();

    // --- Column count control (radio group in featureToggle.ejs, no role restriction) ---
    var colsRadios = document.querySelectorAll('input[name="card-cols"]');
    for (var cr = 0; cr < colsRadios.length; cr++) {
      colsRadios[cr].checked = parseInt(colsRadios[cr].value, 10) === grid.getCols();
      colsRadios[cr].addEventListener('change', function (e) {
        if (!e.target.checked) return;
        grid.setCols(parseInt(e.target.value, 10));
        writeJSON(colsKey, grid.getCols());

        // Only clamp cards that already have an explicit saved span oversized for the new
        // column count — a card with no saved span at all stays on the CSS default
        // (full-width, "1 / -1"), which already adapts to any column count on its own.
        var sizes = readJSON(sizeKey, {});
        if (sizes && typeof sizes === 'object') {
          var changed = false;
          var cardsNow = cardsOf(list);
          for (var n = 0; n < cardsNow.length; n++) {
            var id = cardsNow[n].getAttribute('data-card-id');
            var savedSz = sizes[id];
            if (savedSz && typeof savedSz.colSpan === 'number' && savedSz.colSpan > grid.getCols()) {
              grid.applyColSpan(cardsNow[n], grid.getCols());
              sizes[id] = { colSpan: grid.getCols(), heightPx: typeof savedSz.heightPx === 'number' ? savedSz.heightPx : null };
              changed = true;
            }
          }
          if (changed) writeJSON(sizeKey, sizes);
        }

        // Column count changes where every card lands, not just the ones that got clamped
        // above.
        grid.reposition();
      });
    }

    // --- Drag-reorder + drag-resize (Admin-only: only present when featureToggle.ejs
    // decided this session is an Admin — see its "Riordina card" switch). A Mod (or anyone
    // just browsing) still gets the fully-positioned, read-only layout above. ---
    var lockSwitch = document.getElementById('card-lock-btn');
    if (!lockSwitch) return;

    // Only actually write to localStorage when re-locking if something really changed —
    // flipping the switch back off without having dragged or resized anything (or dragging
    // a card right back to where it started) is a no-op, checked by comparing against a
    // snapshot taken the moment reorder mode turned on.
    var orderAtLockStart = [];
    var sizesAtLockStart = {};

    var dnd = createDragController(grid, list);
    var resize = createResizeController(grid, list);

    var initialCards = cardsOf(list);
    for (var k = 0; k < initialCards.length; k++) dnd.attach(initialCards[k]);
    // Explicit rather than relying on the browser's own default draggable behavior for a
    // plain <section> — belt and suspenders so a page that's never touched the Reorder
    // switch still can't have a card dragged by accident.
    dnd.disable();

    // Plain client-side mode toggle, same fixed-label convention as the Admin only/Edit
    // switches above — but unlike those, this one is NOT wired to submit its own form on
    // every change (there's no persisted "is this feature in reorder mode" boolean). It
    // only ever writes to localStorage when flipped back OFF after something was actually
    // dragged or resized.
    lockSwitch.addEventListener('change', function () {
      if (lockSwitch.checked) {
        dnd.enable();
        list.classList.add('reorder-mode');
        orderAtLockStart = grid.currentOrder();
        sizesAtLockStart = grid.currentSizes();
        var cards = cardsOf(list);
        for (var ci = 0; ci < cards.length; ci++) {
          addDragHandle(cards[ci]);
          resize.addGrip(cards[ci]);
          // A card resized shorter than its own content scrolls internally (see style.css's
          // overflow-y: auto on [data-height-px]) — and the drag handle/resize grip just
          // added above are, like the rest of the card's content, part of that scrolled
          // area, so a card left scrolled partway down from normal browsing could otherwise
          // open reorder mode with its own controls scrolled out of reach. Reset to the top
          // every time reorder mode turns on so both are always immediately reachable.
          cards[ci].scrollTop = 0;
        }
        return;
      }

      // Switched OFF: this is the only moment a new order/size gets saved, and only if
      // something was actually dragged or resized. No page reload needed anymore — the DOM
      // already reflects the change, localStorage is just catching up to it.
      dnd.disable();
      list.classList.remove('reorder-mode');
      removeDragHandles(list);
      resize.removeGrips();

      var orderNow = grid.currentOrder();
      var sizesNow = grid.currentSizes();
      var orderChanged = JSON.stringify(orderNow) !== JSON.stringify(orderAtLockStart);
      var sizesChanged = JSON.stringify(sizesNow) !== JSON.stringify(sizesAtLockStart);
      if (orderChanged) writeJSON(orderKey, orderNow);
      if (sizesChanged) writeJSON(sizeKey, sizesNow);
    });
  }
})();
