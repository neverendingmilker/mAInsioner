// Vanilla-JS drag-and-drop reordering for the sidebar's Feature list, no dependencies —
// same technique as qotdReorder.js/themesReorder.js, plus a lock button gating whether
// dragging is even possible at all (off by default, so browsing the sidebar normally
// never risks an accidental reorder). Admin-only: sidebar.ejs only prints this script tag
// and the drag handles/lock button for an Admin session in the first place.
(function () {
  var lockBtn = document.getElementById('sidebar-lock-btn');
  var list = document.getElementById('sidebar-feature-list');
  var form = document.getElementById('sidebar-reorder-form');
  var orderInput = document.getElementById('sidebar-order-input');
  if (!lockBtn || !list || !form || !orderInput) return;

  var dragged = null;
  var unlocked = false;

  function currentOrder() {
    var rows = list.querySelectorAll('.nav-item');
    var keys = [];
    for (var i = 0; i < rows.length; i++) keys.push(rows[i].getAttribute('data-key'));
    return keys.join(',');
  }

  function submitNewOrder() {
    orderInput.value = currentOrder();
    form.submit();
  }

  function setDraggable(on) {
    var rows = list.querySelectorAll('.nav-item');
    for (var i = 0; i < rows.length; i++) rows[i].setAttribute('draggable', on ? 'true' : 'false');
  }

  var items = list.querySelectorAll('.nav-item');
  for (var i = 0; i < items.length; i++) attachHandlers(items[i]);

  function attachHandlers(row) {
    row.addEventListener('dragstart', function (e) {
      if (!unlocked) {
        e.preventDefault();
        return;
      }
      dragged = row;
      row.classList.add('nav-dragging');
    });

    row.addEventListener('dragend', function () {
      if (!unlocked) return;
      row.classList.remove('nav-dragging');
      dragged = null;
      submitNewOrder();
    });

    row.addEventListener('dragover', function (e) {
      if (!unlocked || !dragged || dragged === row) return;
      e.preventDefault();
      var rect = row.getBoundingClientRect();
      var after = e.clientY - rect.top > rect.height / 2;
      list.insertBefore(dragged, after ? row.nextSibling : row);
    });
  }

  lockBtn.addEventListener('click', function () {
    unlocked = !unlocked;
    setDraggable(unlocked);
    list.classList.toggle('reorder-mode', unlocked);
    lockBtn.textContent = unlocked ? '🔓' : '🔒';
    lockBtn.title = unlocked ? 'Blocca la posizione delle sezioni' : 'Sblocca per riordinare le sezioni';
  });
})();
