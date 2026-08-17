// Vanilla-JS drag-and-drop reordering for the "cards" (panel sections) on a feature page,
// no dependencies — same technique as qotdReorder.js/themesReorder.js, plus a lock button
// gating whether dragging is possible at all (off by default, so browsing a feature page
// never risks an accidental reorder), and the saved order is applied to the DOM on every
// load (for Admin and Mod alike) even when the lock button itself isn't rendered (Mods
// never see it — see partials/featureToggle.ejs).
(function () {
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

  var lockBtn = document.getElementById('card-lock-btn');
  var form = document.getElementById('card-reorder-form');
  var orderInput = document.getElementById('card-order-input');
  if (!lockBtn || !form || !orderInput) return; // Mod session: order applied above, nothing draggable to wire up.

  var dragged = null;
  var unlocked = false;

  function currentOrder() {
    var cards = list.querySelectorAll('.panel[data-card-id]');
    var ids = [];
    for (var i = 0; i < cards.length; i++) ids.push(cards[i].getAttribute('data-card-id'));
    return ids.join(',');
  }

  function submitNewOrder() {
    orderInput.value = currentOrder();
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
      submitNewOrder();
    });

    card.addEventListener('dragover', function (e) {
      if (!unlocked || !dragged || dragged === card) return;
      e.preventDefault();
      var rect = card.getBoundingClientRect();
      var after = e.clientY - rect.top > rect.height / 2;
      list.insertBefore(dragged, after ? card.nextSibling : card);
    });
  }

  lockBtn.addEventListener('click', function () {
    unlocked = !unlocked;
    setDraggable(unlocked);
    list.classList.toggle('reorder-mode', unlocked);
    if (unlocked) {
      var cards = list.querySelectorAll('.panel[data-card-id]');
      for (var i = 0; i < cards.length; i++) addHandle(cards[i]);
    } else {
      removeHandles();
    }
    lockBtn.textContent = unlocked ? '🔓 Blocca posizione card' : '🔒 Riordina card';
    lockBtn.title = unlocked ? 'Blocca la posizione delle card' : 'Sblocca per riordinare le card';
  });
})();
