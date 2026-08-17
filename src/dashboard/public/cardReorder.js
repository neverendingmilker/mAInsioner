// Vanilla-JS drag-and-drop reordering AND drag-to-resize for the "cards" (panel sections)
// on a feature page, no dependencies — same drag-reorder technique as
// qotdReorder.js/themesReorder.js, plus a "Riordina card" switch gating whether either is
// possible at all (off by default, so browsing a feature page never risks an accidental
// change), and the saved order/sizes are applied to the DOM on every load (for Admin and
// Mod alike) even when the switch itself isn't rendered (Mods never see it — see
// partials/featureToggle.ejs). This is the standard for every feature page's #card-list,
// current and future — nothing here is Anime-Night-specific (it was only ever piloted
// there before being made the default for every page).
(function () {
  // Included from partials/featureToggle.ejs, which every view renders near the TOP of the
  // page (inside .page-header) — well before the #card-list markup further down. Without
  // waiting for DOMContentLoaded, this script would run immediately on <script> parse, find
  // no #card-list yet, and bail out silently (the bug that shipped initially: the switch
  // existed in the DOM but nothing was ever wired up to it).
  document.addEventListener('DOMContentLoaded', init);

  // Must match public/style.css's `.card-list { grid-template-columns: repeat(3, 1fr) }`
  // and `grid-auto-rows: minmax(140px, auto)` — used only to translate a resize drag's
  // pixel delta into a column/row count, not to size anything itself (the grid's own CSS
  // does that). A row can render taller than this if its content needs it to, so the row
  // math below is a snapping approximation, not a pixel-exact measurement.
  var COLS = 3;
  var ROW_UNIT = 140;
  var GAP = 24;
  var MAX_ROW_SPAN = 6;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function init() {
    var list = document.getElementById('card-list');
    if (!list) return;

    var orderDataEl = document.getElementById('card-order-data');
    var savedOrder = [];
    if (orderDataEl) {
      try {
        var parsed = JSON.parse(orderDataEl.textContent || '[]');
        if (Array.isArray(parsed)) savedOrder = parsed;
      } catch (e) {
        savedOrder = [];
      }
    }

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

    // Apply saved per-card grid spans — for Admin and Mod alike, same as the order above.
    // Every card defaults to span 3/1 (full width, one row — see style.css) purely from
    // CSS, so a page nobody has ever resized needs no JS here at all; this only overrides
    // cards that have an explicit saved span.
    var sizeDataEl = document.getElementById('card-size-data');
    var savedSizes = {};
    if (sizeDataEl) {
      try {
        var parsedSizes = JSON.parse(sizeDataEl.textContent || '{}');
        if (parsedSizes && typeof parsedSizes === 'object') savedSizes = parsedSizes;
      } catch (e) {
        savedSizes = {};
      }
    }
    var cardsForSize = list.querySelectorAll('.panel[data-card-id]');
    for (var s = 0; s < cardsForSize.length; s++) {
      var cid = cardsForSize[s].getAttribute('data-card-id');
      var sz = savedSizes[cid];
      if (sz && typeof sz.colSpan === 'number' && typeof sz.rowSpan === 'number') {
        applySpan(cardsForSize[s], sz.colSpan, sz.rowSpan);
      }
    }

    var lockSwitch = document.getElementById('card-lock-btn');
    var form = document.getElementById('card-reorder-form');
    var orderInput = document.getElementById('card-order-input');
    var sizeInput = document.getElementById('card-size-input');
    if (!lockSwitch || !form || !orderInput) return; // Mod session: order/sizes applied above, nothing draggable to wire up.

    var dragged = null;
    var unlocked = false;
    // Set on any drop while unlocked, so re-locking the switch only actually POSTs (and
    // reloads the page) if something was really moved — flipping it back off without
    // having dragged anything is a no-op, not a wasted round-trip.
    var moved = false;
    // Snapshot of every card's column/row span taken the moment reorder mode turns on,
    // compared against the current spans when it turns back off — same "only save if
    // something actually changed" behavior as `moved` above, but for resize instead of drag.
    var sizesAtLockStart = {};

    function currentOrder() {
      var cards = list.querySelectorAll('.panel[data-card-id]');
      var ids = [];
      for (var i = 0; i < cards.length; i++) ids.push(cards[i].getAttribute('data-card-id'));
      return ids.join(',');
    }

    function readSpan(card) {
      return {
        colSpan: parseInt(card.getAttribute('data-col-span') || '3', 10),
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

    function submitNewOrder() {
      orderInput.value = currentOrder();
      if (sizeInput) sizeInput.value = JSON.stringify(currentSizes());
      form.submit();
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
    // handle, just quantized to whole grid cells instead of following the cursor 1:1.
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
        // Just marks the order dirty — does NOT save. Saving (and the page reload that
        // comes with it) only happens when the user flips the switch back off, so moving
        // several cards in a row doesn't re-lock/reload after every single drop.
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

    // Plain client-side mode toggle, same fixed-label convention as the Solo Admin/
    // Modificabile switches above — but unlike those, this one is NOT wired to submit its
    // own form on every change (there's no persisted "is this feature in reorder mode"
    // boolean to save). It only ever touches the server when flipped back OFF after
    // something was actually dragged or resized, via the hidden #card-reorder-form.
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
      // something was actually dragged or resized — the user decides when to persist by
      // flipping the switch back off themselves, dragging/resizing never saves on its own.
      unlocked = false;
      setDraggable(false);
      list.classList.remove('reorder-mode');
      removeHandles();
      removeResizeGrips();
      var resized = JSON.stringify(currentSizes()) !== JSON.stringify(sizesAtLockStart);
      if (moved || resized) {
        submitNewOrder(); // POSTs and reloads the page.
      }
    });
  }
})();
