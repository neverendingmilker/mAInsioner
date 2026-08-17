// Vanilla-JS card grid for a feature page's #card-list: explicit (row, column) placement,
// multi-column span (1..COLS), free height, and deliberate empty cells — plus drag-and-drop
// to move cards around and a resize grip for width/height. No dependencies, no build step.
//
// --- The model ---
// Think of the grid as an invisible spreadsheet: COLS columns (1-3, same picker as before)
// and as many rows as needed. Every card has an explicit `{col, colSpan, row, heightPx}` —
// NOT a position inferred from DOM order or from a "pack everything tightly" algorithm like
// the previous version of this file used. That's the deliberate difference from before:
// nothing here ever auto-flows a card into a gap you left on purpose. A cell nobody's card
// claims is simply empty — there's no placeholder element for it, it's just blank grid
// space, exactly like an empty cell in a spreadsheet.
//
// Consequences of that model:
// - Dragging a card moves it to wherever you drop it (snapped to the nearest cell), and it
//   stays there — it never gets nudged elsewhere because some other card changed size.
// - You can leave a cell empty anywhere — between two cards in the same column, or as a gap
//   before a card further down — just by not putting anything there.
// - A drop (or a resize growing into another card's space) is only allowed if the target
//   cells are actually free; otherwise the card snaps back to its last valid spot. Nothing
//   here ever silently overlaps or swaps two cards.
// - Width still moves in whole-column steps (CSS Grid's equal-width columns can't do
//   fractional widths); height stays completely free in pixels, with the same magnetic
//   snap-to-a-neighbor's-edge (and automatic release once you drag past it) as before.
//
// Reorder/resize are Admin-only (gated by whether #card-lock-btn exists — see
// featureToggle.ejs); column count is a personal viewing preference open to Admin and Mod.
// Everything lives in *this browser's own* localStorage, keyed by feature, never sent to
// the server.
(function () {
  'use strict';

  var CONFIG = {
    // One grid row-track is this tall (must match style.css's
    // `.card-list { grid-auto-rows: minmax(140px, auto) }`), used to turn a free pixel
    // height into an integer row-span for the occupancy grid, and to turn a cursor Y
    // position into a row index while dragging/resizing.
    rowUnit: 140,
    gap: 24,
    minCols: 1,
    maxCols: 3,
    defaultCols: 3,
    minHeightPx: 140, // == rowUnit
    maxHeightPx: 140 * 6 + 24 * 5, // same ceiling earlier versions used (6 row-tracks)
    // How close (in px) a card's dragged-to bottom edge needs to land to another visible
    // card's bottom edge before it magnetically snaps to match it exactly.
    snapThresholdPx: 14,
    // How many extra empty rows to show past the lowest occupied row while dragging or
    // resizing, so there's always visible room to drop something further down too.
    bufferRows: 2,
    storagePrefix: 'mainsioner:cardLayout:',
  };

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

  function currentFeatureKey() {
    var seg = (location.pathname.split('/')[1] || '').toLowerCase();
    return seg || 'root';
  }

  // Collapses any number of calls within the same animation frame into exactly one, running
  // with the arguments from the *last* call — so a stream of mousemove events (which fire
  // far faster than the browser paints) only ever triggers one recompute per frame.
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

  function footprintRowSpan(heightPx) {
    return heightPx === null || heightPx === undefined
      ? 1
      : Math.max(1, Math.ceil((heightPx + CONFIG.gap) / (CONFIG.rowUnit + CONFIG.gap)));
  }

  // ---------------------------------------------------------------------------------------
  // Grid model: an explicit {col, colSpan, row, heightPx} per card id, plus the occupancy
  // math (what's free, what collides) that both the drag and resize controllers use. This
  // is the ONLY thing that decides where a card renders — see render() below, which just
  // writes each position straight out as inline grid-column/grid-row, no placement
  // algorithm involved.
  // ---------------------------------------------------------------------------------------

  function createGrid(list) {
    var cols = CONFIG.defaultCols;
    var positions = {}; // id -> {col, colSpan, row, heightPx}

    function setCols(n) {
      cols = clamp(n, CONFIG.minCols, CONFIG.maxCols);
      list.style.setProperty('--card-cols', String(cols));
    }
    function getCols() {
      return cols;
    }

    function getPosition(id) {
      return positions[id] || null;
    }

    function setPosition(id, pos) {
      positions[id] = {
        col: clamp(Math.round(pos.col), 0, cols - 1),
        colSpan: clamp(Math.round(pos.colSpan), 1, cols),
        row: Math.max(1, Math.round(pos.row)),
        heightPx: typeof pos.heightPx === 'number' ? clamp(pos.heightPx, CONFIG.minHeightPx, CONFIG.maxHeightPx) : null,
      };
      // colSpan can't push the card past the right edge.
      positions[id].colSpan = clamp(positions[id].colSpan, 1, cols - positions[id].col);
    }

    function allPositions() {
      var copy = {};
      for (var id in positions) copy[id] = positions[id] ? { col: positions[id].col, colSpan: positions[id].colSpan, row: positions[id].row, heightPx: positions[id].heightPx } : null;
      return copy;
    }

    function loadPositions(map) {
      positions = {};
      for (var id in map) {
        var p = map[id];
        if (!p || typeof p.col !== 'number' || typeof p.row !== 'number') continue;
        setPosition(id, p);
      }
    }

    // Highest occupied row + 1 (i.e. the first fully-free row) — used both to place a
    // brand-new card that has no saved position yet, and as the base for how many empty
    // rows the drag/resize overlay shows below the current content.
    function lowestFreeRow() {
      var max = 1;
      for (var id in positions) {
        var p = positions[id];
        max = Math.max(max, p.row + footprintRowSpan(p.heightPx));
      }
      return max;
    }

    // Every occupied cell as a "row,col" -> id map, optionally leaving one card's own
    // cells out (so it doesn't collide with itself while being dragged/resized).
    function occupiedCells(excludeId) {
      var occ = {};
      for (var id in positions) {
        if (id === excludeId) continue;
        var p = positions[id];
        var rowSpan = footprintRowSpan(p.heightPx);
        for (var r = p.row; r < p.row + rowSpan; r++) {
          for (var c = p.col; c < p.col + p.colSpan; c++) occ[r + ',' + c] = id;
        }
      }
      return occ;
    }

    function fits(occ, row, col, colSpan, rowSpan) {
      if (col < 0 || col + colSpan > cols || row < 1) return false;
      for (var r = row; r < row + rowSpan; r++) {
        for (var c = col; c < col + colSpan; c++) {
          if (occ[r + ',' + c]) return false;
        }
      }
      return true;
    }

    // How far a footprint starting at (row, col) with the given rowSpan can grow to the
    // right (in whole columns) before hitting the grid edge or another card.
    function maxColSpanFrom(occ, row, col, rowSpan) {
      var maxPossible = cols - col;
      for (var span = 1; span <= maxPossible; span++) {
        for (var r = row; r < row + rowSpan; r++) {
          if (occ[r + ',' + (col + span - 1)]) return span - 1;
        }
      }
      return maxPossible;
    }

    // Same idea downward: how many row-tracks a footprint at (row, col) with the given
    // colSpan can grow before hitting another card. No hard ceiling other than sanity —
    // there's no "grid edge" going down, rows just keep going.
    function maxRowSpanFrom(occ, row, col, colSpan) {
      var span = 1;
      while (span < 200) {
        var r = row + span;
        for (var c = col; c < col + colSpan; c++) {
          if (occ[r + ',' + c]) return span;
        }
        span++;
      }
      return span;
    }

    // Writes every card's current position straight to inline grid-column/grid-row — the
    // only thing that ever actually moves a card on screen. No placement algorithm here;
    // whatever's in `positions` is exactly what renders.
    function render() {
      var cards = cardsOf(list);
      for (var i = 0; i < cards.length; i++) {
        var id = cards[i].getAttribute('data-card-id');
        var p = positions[id];
        if (!p) continue;
        var rowSpan = footprintRowSpan(p.heightPx);
        cards[i].style.gridColumn = (p.col + 1) + ' / span ' + p.colSpan;
        cards[i].style.gridRow = p.row + ' / span ' + rowSpan;
        if (p.heightPx !== null) {
          cards[i].style.height = p.heightPx + 'px';
          cards[i].setAttribute('data-height-px', String(Math.round(p.heightPx)));
        } else {
          cards[i].style.height = '';
          cards[i].removeAttribute('data-height-px');
        }
      }
    }

    return {
      setCols: setCols,
      getCols: getCols,
      getPosition: getPosition,
      setPosition: setPosition,
      allPositions: allPositions,
      loadPositions: loadPositions,
      lowestFreeRow: lowestFreeRow,
      occupiedCells: occupiedCells,
      fits: fits,
      maxColSpanFrom: maxColSpanFrom,
      maxRowSpanFrom: maxRowSpanFrom,
      render: render,
    };
  }

  // ---------------------------------------------------------------------------------------
  // Grid overlay: while dragging or resizing, shows a dashed outline over every currently
  // empty cell (so the "invisible" grid becomes visible exactly when it's useful) and a
  // filled highlight — green if the spot under the cursor is free, red if it would overlap
  // another card — over whatever footprint is currently being dragged/resized onto. Purely
  // visual: every element here is pointer-events:none and never affects hit-testing.
  // ---------------------------------------------------------------------------------------

  function createOverlay(list, grid) {
    var emptyCells = [];
    var targetCells = [];

    function clearEmpty() {
      for (var i = 0; i < emptyCells.length; i++) emptyCells[i].parentNode.removeChild(emptyCells[i]);
      emptyCells = [];
    }

    function clearTarget() {
      for (var i = 0; i < targetCells.length; i++) targetCells[i].parentNode.removeChild(targetCells[i]);
      targetCells = [];
    }

    function showEmpty(excludeId) {
      clearEmpty();
      var cols = grid.getCols();
      var lastRow = grid.lowestFreeRow() + CONFIG.bufferRows;
      var occ = grid.occupiedCells(excludeId);
      for (var r = 1; r <= lastRow; r++) {
        for (var c = 0; c < cols; c++) {
          if (occ[r + ',' + c]) continue;
          var cell = document.createElement('div');
          cell.className = 'card-grid-cell';
          cell.style.gridColumn = (c + 1) + ' / span 1';
          cell.style.gridRow = r + ' / span 1';
          list.appendChild(cell);
          emptyCells.push(cell);
        }
      }
    }

    function showTarget(row, col, colSpan, rowSpan, valid) {
      clearTarget();
      var cols = grid.getCols();
      for (var r = row; r < row + rowSpan; r++) {
        for (var c = col; c < col + colSpan; c++) {
          if (c < 0 || c >= cols || r < 1) continue;
          var cell = document.createElement('div');
          cell.className = 'card-grid-target ' + (valid ? 'card-grid-target--valid' : 'card-grid-target--invalid');
          cell.style.gridColumn = (c + 1) + ' / span 1';
          cell.style.gridRow = r + ' / span 1';
          list.appendChild(cell);
          targetCells.push(cell);
        }
      }
    }

    function clearAll() {
      clearEmpty();
      clearTarget();
    }

    return { showEmpty: showEmpty, showTarget: showTarget, clearAll: clearAll };
  }

  // ---------------------------------------------------------------------------------------
  // Drag-to-move: mouse-driven (not native HTML5 DnD — that's built around reordering a
  // list by sibling position, not dropping onto an arbitrary cell in a 2D grid). Tracks the
  // cursor, converts its position into a candidate (row, col). If the card's own cell
  // (anchor) is already occupied, the drop is rejected outright — same as before, no swaps,
  // no overlaps. Otherwise, if the card's full size doesn't fit at that spot (a neighbor, or
  // just the grid's right edge, is in the way), it's shrunk down to whatever fits there —
  // never left blocked just because the empty slot underneath is smaller than the card.
  // ---------------------------------------------------------------------------------------

  function createDragController(grid, list, overlay) {
    function startDrag(card, startEvent) {
      var id = card.getAttribute('data-card-id');
      var startPos = grid.getPosition(id);
      if (!startPos) return;

      var listRect = list.getBoundingClientRect();
      var cols = grid.getCols();
      var colWidth = (listRect.width - CONFIG.gap * (cols - 1)) / cols;
      var rowSpan = footprintRowSpan(startPos.heightPx);
      var occ = grid.occupiedCells(id);

      // Where the cursor grabbed the card, so it keeps following the cursor naturally
      // instead of its top-left corner jumping to the cursor position.
      var cardRect = card.getBoundingClientRect();
      var grabOffsetX = startEvent.clientX - cardRect.left;
      var grabOffsetY = startEvent.clientY - cardRect.top;

      card.classList.add('card-dragging');
      overlay.showEmpty(id);

      var latestEvent = startEvent;

      function apply() {
        var e = latestEvent;
        var cardLeft = e.clientX - grabOffsetX;
        var cardTop = e.clientY - grabOffsetY;
        // Clamped to the grid itself (not `cols - colSpan` like before) — a card can now be
        // dropped anywhere along the row, including spots too narrow for its current width,
        // and shrink to fit instead of being kept out of reach of the edge.
        var col = clamp(Math.round((cardLeft - listRect.left) / (colWidth + CONFIG.gap)), 0, cols - 1);
        var row = Math.max(1, Math.round((cardTop - listRect.top) / (CONFIG.rowUnit + CONFIG.gap)) + 1);

        // The card's own top-left cell has to be genuinely free — shrinking never helps if
        // you're dropping straight on top of another card, only if the card is just too big
        // for an otherwise-open spot.
        if (occ[row + ',' + col]) {
          overlay.showTarget(row, col, startPos.colSpan, rowSpan, false);
          return;
        }

        // Same clamp order resize uses: width first (against the card's original height),
        // then height (against whatever width just got clamped to) — so the two never
        // disagree about which cells the final, possibly-shrunk footprint covers.
        var maxColSpan = grid.maxColSpanFrom(occ, row, col, rowSpan);
        var effectiveColSpan = clamp(startPos.colSpan, 1, Math.max(1, maxColSpan));

        var maxRowSpan = grid.maxRowSpanFrom(occ, row, col, effectiveColSpan);
        var effectiveRowSpan = clamp(rowSpan, 1, Math.max(1, maxRowSpan));

        // Only touch heightPx if the row-span actually had to shrink — a free/natural height
        // (null) or one that already fit stays exactly as it was.
        var effectiveHeightPx =
          effectiveRowSpan < rowSpan ? effectiveRowSpan * CONFIG.rowUnit + (effectiveRowSpan - 1) * CONFIG.gap : startPos.heightPx;

        grid.setPosition(id, { col: col, colSpan: effectiveColSpan, row: row, heightPx: effectiveHeightPx });
        grid.render();
        overlay.showTarget(row, col, effectiveColSpan, effectiveRowSpan, true);
      }

      var scheduleApply = rafThrottle(apply);
      function onMove(e) {
        latestEvent = e;
        scheduleApply();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        card.classList.remove('card-dragging');
        overlay.clearAll();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function addHandle(card) {
      if (card.querySelector('.card-drag-handle')) return;
      var handle = document.createElement('span');
      handle.className = 'card-drag-handle';
      handle.title = 'Trascina per spostare in un’altra cella';
      handle.textContent = '⣿';
      handle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        startDrag(card, e);
      });
      card.insertBefore(handle, card.firstChild);
    }

    function removeHandles() {
      var handles = list.querySelectorAll('.card-drag-handle');
      for (var i = 0; i < handles.length; i++) handles[i].parentNode.removeChild(handles[i]);
    }

    return { addHandle: addHandle, removeHandles: removeHandles };
  }

  // ---------------------------------------------------------------------------------------
  // Drag-to-resize. Width moves in whole-column steps; height is completely free in pixels
  // with a magnetic snap to a neighboring card's bottom edge that releases the moment you
  // keep dragging past it (recomputed fresh from the raw cursor position every move, never
  // carried over, so there's no accumulated state that could leave a card stuck). Growing
  // in either direction is clamped the moment it would collide with another card's cells —
  // nothing here ever pushes another card out of the way.
  // ---------------------------------------------------------------------------------------

  function createResizeController(grid, list, overlay) {
    function startResize(card, startEvent) {
      var id = card.getAttribute('data-card-id');
      var startPos = grid.getPosition(id);
      if (!startPos) return;

      var startX = startEvent.clientX;
      var startY = startEvent.clientY;
      var startHeightPx = startPos.heightPx !== null ? startPos.heightPx : clamp(card.getBoundingClientRect().height, CONFIG.minHeightPx, CONFIG.maxHeightPx);
      var listRect = list.getBoundingClientRect();
      var cols = grid.getCols();
      var colWidth = (listRect.width - CONFIG.gap * (cols - 1)) / cols;
      var occ = grid.occupiedCells(id);

      card.classList.add('card-resizing');
      overlay.showEmpty(id);

      var latestEvent = startEvent;

      function apply() {
        var e = latestEvent;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;

        var desiredColSpan = clamp(startPos.colSpan + Math.round(dx / (colWidth + CONFIG.gap)), 1, cols - startPos.col);

        var cardTop = card.getBoundingClientRect().top;
        var rawHeight = clamp(startHeightPx + dy, CONFIG.minHeightPx, CONFIG.maxHeightPx);
        var proposedBottom = cardTop + rawHeight;

        // Magnetic snap to a neighboring card's bottom edge — same rule as before, just
        // computed fresh every move so continuing to drag past the threshold releases it.
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
        var desiredHeight = snappedHeight !== null ? snappedHeight : rawHeight;
        var desiredRowSpan = footprintRowSpan(desiredHeight);

        // Clamp growth against whatever's actually occupied — width first (using the
        // desired row-span), then height (using whatever width just got clamped to), so
        // the two never disagree about which cells the final footprint covers.
        var maxColSpan = grid.maxColSpanFrom(occ, startPos.row, startPos.col, desiredRowSpan);
        var finalColSpan = clamp(desiredColSpan, 1, Math.max(1, maxColSpan));

        var maxRowSpan = grid.maxRowSpanFrom(occ, startPos.row, startPos.col, finalColSpan);
        var finalRowSpan = clamp(desiredRowSpan, 1, Math.max(1, maxRowSpan));
        var finalHeight = finalRowSpan >= desiredRowSpan ? desiredHeight : finalRowSpan * CONFIG.rowUnit + (finalRowSpan - 1) * CONFIG.gap;
        finalHeight = clamp(finalHeight, CONFIG.minHeightPx, CONFIG.maxHeightPx);

        grid.setPosition(id, { col: startPos.col, colSpan: finalColSpan, row: startPos.row, heightPx: finalHeight });
        grid.render();
        overlay.showTarget(startPos.row, startPos.col, finalColSpan, finalRowSpan, true);
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
        overlay.clearAll();
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function addGrip(card) {
      if (card.querySelector('.card-resize-grip')) return;
      var grip = document.createElement('span');
      grip.className = 'card-resize-grip';
      grip.title = 'Trascina per ridimensionare (larghezza a step, altezza libera — non puoi crescere sopra un’altra card)';
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
  // One-time migration: browsers that saved a layout under the *previous* version of this
  // file (DOM order + {colSpan, heightPx}, auto-packed by a "shortest column" algorithm)
  // get their existing layout converted into explicit positions once, so upgrading doesn't
  // silently reset anyone's arrangement. Reuses that same packing rule purely as a one-shot
  // starting point — nothing in the live grid works this way anymore afterward.
  // ---------------------------------------------------------------------------------------

  function migrateLegacyLayout(cardIds, legacyOrder, legacySizes, cols) {
    var idSet = {};
    for (var i = 0; i < cardIds.length; i++) idSet[cardIds[i]] = true;

    var orderedIds = [];
    if (Array.isArray(legacyOrder)) {
      for (var o = 0; o < legacyOrder.length; o++) {
        if (idSet[legacyOrder[o]]) orderedIds.push(legacyOrder[o]);
      }
    }
    for (var c = 0; c < cardIds.length; c++) {
      if (orderedIds.indexOf(cardIds[c]) === -1) orderedIds.push(cardIds[c]);
    }

    var colBottom = [];
    for (var k = 0; k < cols; k++) colBottom.push(1);

    var positions = {};
    for (var j = 0; j < orderedIds.length; j++) {
      var id = orderedIds[j];
      var sz = (legacySizes && legacySizes[id]) || {};
      var colSpan = clamp(typeof sz.colSpan === 'number' ? sz.colSpan : cols, 1, cols);
      var heightPx = null;
      if (typeof sz.heightPx === 'number') {
        heightPx = sz.heightPx;
      } else if (typeof sz.rowSpan === 'number') {
        heightPx = sz.rowSpan * CONFIG.rowUnit + (sz.rowSpan - 1) * CONFIG.gap;
      }
      var rowSpan = footprintRowSpan(heightPx);

      var bestCol = 0;
      var bestStart = Infinity;
      for (var start = 0; start <= cols - colSpan; start++) {
        var neededRow = 1;
        for (var m = start; m < start + colSpan; m++) neededRow = Math.max(neededRow, colBottom[m]);
        if (neededRow < bestStart) {
          bestStart = neededRow;
          bestCol = start;
        }
      }

      positions[id] = { col: bestCol, colSpan: colSpan, row: bestStart, heightPx: heightPx };
      for (var n = bestCol; n < bestCol + colSpan; n++) colBottom[n] = bestStart + rowSpan;
    }

    return positions;
  }

  // ---------------------------------------------------------------------------------------
  // Wiring: load the saved layout (or migrate/default one), apply it, and (Admin-only) hook
  // up the Reorder switch that turns dragging/resizing on and off.
  // ---------------------------------------------------------------------------------------

  function init() {
    var list = document.getElementById('card-list');
    if (!list) return;

    var featureKey = currentFeatureKey();
    var layoutKey = CONFIG.storagePrefix + featureKey + ':layout';
    var colsKey = CONFIG.storagePrefix + featureKey + ':cols';
    var legacyOrderKey = CONFIG.storagePrefix + featureKey + ':order';
    var legacySizeKey = CONFIG.storagePrefix + featureKey + ':size';

    var grid = createGrid(list);
    grid.setCols(parseInt(readJSON(colsKey, CONFIG.defaultCols), 10) || CONFIG.defaultCols);

    var cardIds = [];
    var initialCards = cardsOf(list);
    for (var i = 0; i < initialCards.length; i++) cardIds.push(initialCards[i].getAttribute('data-card-id'));

    var savedLayout = readJSON(layoutKey, null);
    if (savedLayout && typeof savedLayout === 'object') {
      grid.loadPositions(savedLayout);
    } else {
      var legacyOrder = readJSON(legacyOrderKey, null);
      var legacySizes = readJSON(legacySizeKey, null);
      if (legacyOrder || legacySizes) {
        grid.loadPositions(migrateLegacyLayout(cardIds, legacyOrder, legacySizes, grid.getCols()));
      }
    }

    // Any card with no position at all yet (first-ever load, or a brand-new card added to
    // the page since the layout was last saved) gets stacked at the bottom, full width —
    // same "just a plain list" look every page started with before any of this existed.
    var nextRow = grid.lowestFreeRow();
    for (var j = 0; j < cardIds.length; j++) {
      if (!grid.getPosition(cardIds[j])) {
        grid.setPosition(cardIds[j], { col: 0, colSpan: grid.getCols(), row: nextRow, heightPx: null });
        nextRow = grid.lowestFreeRow();
      }
    }

    grid.render();
    if (savedLayout === null) writeJSON(layoutKey, grid.allPositions()); // persist the migrated/default layout so it's stable from here on

    // --- Column count control (radio group in featureToggle.ejs, no role restriction) ---
    var colsRadios = document.querySelectorAll('input[name="card-cols"]');
    for (var cr = 0; cr < colsRadios.length; cr++) {
      colsRadios[cr].checked = parseInt(colsRadios[cr].value, 10) === grid.getCols();
      colsRadios[cr].addEventListener('change', function (e) {
        if (!e.target.checked) return;
        var newCols = clamp(parseInt(e.target.value, 10), CONFIG.minCols, CONFIG.maxCols);
        grid.setCols(newCols);
        writeJSON(colsKey, newCols);

        // Changing the column count reshapes the whole coordinate space — a card pinned to
        // column 2 has nowhere to go once there's only 1 column. Re-pack everything with
        // the same "shortest column first" rule the old version used globally, but only
        // ever triggered here: this is the one operation explicit placement can't cleanly
        // preserve gaps through, since the grid it was arranged on no longer exists in the
        // same shape. Order-of-appearance (current row, then column) is kept as the input
        // order, so the result stays recognizably close to what was there before.
        var idsNow = [];
        var cardsNow = cardsOf(list);
        for (var n = 0; n < cardsNow.length; n++) idsNow.push(cardsNow[n].getAttribute('data-card-id'));
        idsNow.sort(function (a, b) {
          var pa = grid.getPosition(a);
          var pb = grid.getPosition(b);
          if (!pa || !pb) return 0;
          return pa.row - pb.row || pa.col - pb.col;
        });
        var sizesById = {};
        for (var s = 0; s < idsNow.length; s++) {
          var p = grid.getPosition(idsNow[s]);
          sizesById[idsNow[s]] = { colSpan: p ? p.colSpan : newCols, heightPx: p ? p.heightPx : null };
        }
        grid.loadPositions(migrateLegacyLayout(idsNow, idsNow, sizesById, newCols));
        grid.render();
        writeJSON(layoutKey, grid.allPositions());
      });
    }

    // --- Drag-reorder + drag-resize (Admin-only: only present when featureToggle.ejs
    // decided this session is an Admin — see its "Riordina card" switch). A Mod (or anyone
    // just browsing) still gets the fully-positioned, read-only layout above. ---
    var lockSwitch = document.getElementById('card-lock-btn');
    if (!lockSwitch) return;

    var overlay = createOverlay(list, grid);
    var dnd = createDragController(grid, list, overlay);
    var resize = createResizeController(grid, list, overlay);

    // Only actually write to localStorage when re-locking if something really changed —
    // flipping the switch back off without having dragged or resized anything is a no-op.
    var layoutAtLockStart = {};

    lockSwitch.addEventListener('change', function () {
      if (lockSwitch.checked) {
        list.classList.add('reorder-mode');
        layoutAtLockStart = grid.allPositions();
        var cards = cardsOf(list);
        for (var ci = 0; ci < cards.length; ci++) {
          dnd.addHandle(cards[ci]);
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

      // Switched OFF: this is the only moment a new layout gets saved, and only if
      // something was actually dragged or resized. No page reload needed — the DOM already
      // reflects the change, localStorage is just catching up to it.
      list.classList.remove('reorder-mode');
      dnd.removeHandles();
      resize.removeGrips();
      overlay.clearAll();

      var layoutNow = grid.allPositions();
      if (JSON.stringify(layoutNow) !== JSON.stringify(layoutAtLockStart)) {
        writeJSON(layoutKey, layoutNow);
      }
    });
  }
})();
