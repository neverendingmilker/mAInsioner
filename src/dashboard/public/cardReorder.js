// Vanilla-JS drag-and-drop reordering for the "cards" (panel sections) on a feature page,
// no dependencies — same technique as qotdReorder.js/themesReorder.js, plus a "Riordina
// card" switch gating whether dragging is possible at all (off by default, so browsing a
// feature page never risks an accidental reorder), and the saved order is applied to the
// DOM on every load (for Admin and Mod alike) even when the switch itself isn't rendered
// (Mods never see it — see partials/featureToggle.ejs).
(function () {
  // Included from partials/featureToggle.ejs, which every view renders near the TOP of the
  // page (inside .page-header) — well before the #card-list markup further down. Without
  // waiting for DOMContentLoaded, this script would run immediately on <script> parse, find
  // no #card-list yet, and bail out silently (the bug that shipped initially: the switch
  // existed in the DOM but nothing was ever wired up to it).
  document.addEventListener('DOMContentLoaded', init);

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

    // Apply saved per-card sizes (two-column pages only, see public/style.css's .two-col) —
    // for Admin and Mod alike, same as the order above. Takes each card out of flex's
    // auto-sizing the same way freezeSizesForResize does below, so a saved size actually
    // sticks instead of being immediately overridden by the default ~50% flex-basis.
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
    if (list.classList.contains('two-col')) {
      var cardsForSize = list.querySelectorAll('.panel[data-card-id]');
      for (var s = 0; s < cardsForSize.length; s++) {
        var cid = cardsForSize[s].getAttribute('data-card-id');
        var sz = savedSizes[cid];
        if (sz && typeof sz.width === 'number' && typeof sz.height === 'number') {
          cardsForSize[s].style.flex = 'none';
          cardsForSize[s].style.width = sz.width + 'px';
          cardsForSize[s].style.height = sz.height + 'px';
        }
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
    // Snapshot of every card's pixel size taken the moment reorder mode turns on (see
    // freezeSizesForResize), compared against the current sizes when it turns back off —
    // same "only save if something actually changed" behavior as `moved` above, but for
    // resize instead of drag.
    var sizesAtLockStart = {};

    function currentOrder() {
      var cards = list.querySelectorAll('.panel[data-card-id]');
      var ids = [];
      for (var i = 0; i < cards.length; i++) ids.push(cards[i].getAttribute('data-card-id'));
      return ids.join(',');
    }

    function currentSizes() {
      var result = {};
      if (!list.classList.contains('two-col')) return result;
      var cards = list.querySelectorAll('.panel[data-card-id]');
      for (var i = 0; i < cards.length; i++) {
        var rect = cards[i].getBoundingClientRect();
        result[cards[i].getAttribute('data-card-id')] = { width: Math.round(rect.width), height: Math.round(rect.height) };
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

    // Two-column pages only (public/style.css's .card-list.two-col): while cards are laid
    // out with a flex-basis percentage (the default ~50/50 split), the browser's native
    // resize handle (CSS `resize: both`, turned on for .reorder-mode .panel) sets an inline
    // pixel width that flex-grow/flex-shrink then fights and overrides on every layout pass
    // — so width resize silently does nothing. Snapshotting each card's current pixel size
    // into an inline width/height and switching to `flex: none` the moment reorder mode
    // turns on removes it from the flex sizing algorithm entirely, so the resize handle's
    // own inline width sticks. Left in place after re-locking (deliberately — there's no
    // "reset to default size" control; whatever size the card ends at gets saved).
    function freezeSizesForResize() {
      if (!list.classList.contains('two-col')) return;
      var cardsToFreeze = list.querySelectorAll('.panel[data-card-id]');
      for (var i = 0; i < cardsToFreeze.length; i++) {
        var rect = cardsToFreeze[i].getBoundingClientRect();
        cardsToFreeze[i].style.flex = 'none';
        cardsToFreeze[i].style.width = rect.width + 'px';
        cardsToFreeze[i].style.height = rect.height + 'px';
      }
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
    // something was actually dragged, via the hidden #card-reorder-form.
    lockSwitch.addEventListener('change', function () {
      // Switched ON: enter edit mode, nothing to save yet.
      if (lockSwitch.checked) {
        unlocked = true;
        moved = false;
        setDraggable(true);
        list.classList.add('reorder-mode');
        freezeSizesForResize();
        sizesAtLockStart = currentSizes();
        var cards = list.querySelectorAll('.panel[data-card-id]');
        for (var i = 0; i < cards.length; i++) addHandle(cards[i]);
        return;
      }

      // Switched OFF: this is the only moment a new order/size gets saved, and only if
      // something was actually dragged or resized — the user decides when to persist by
      // flipping the switch back off themselves, dragging/resizing never saves on its own.
      unlocked = false;
      setDraggable(false);
      list.classList.remove('reorder-mode');
      removeHandles();
      var resized = JSON.stringify(currentSizes()) !== JSON.stringify(sizesAtLockStart);
      if (moved || resized) {
        submitNewOrder(); // POSTs and reloads the page.
      }
    });
  }
})();
