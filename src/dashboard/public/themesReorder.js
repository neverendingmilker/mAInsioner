// Vanilla-JS drag-and-drop reordering for the Themes queue — straight copy of
// qotdReorder.js, just pointed at the "#themes-item-list" ids/classes so the two features'
// scripts can coexist on their own pages without colliding.
(function () {
  var list = document.getElementById('themes-item-list');
  if (!list) return;

  var form = document.getElementById('themes-reorder-form');
  var orderInput = document.getElementById('themes-order-input');
  var dragged = null;

  function currentOrder() {
    var rows = list.querySelectorAll('.themes-item');
    var ids = [];
    for (var i = 0; i < rows.length; i++) ids.push(rows[i].getAttribute('data-id'));
    return ids.join(',');
  }

  function submitNewOrder() {
    orderInput.value = currentOrder();
    form.submit();
  }

  var rows = list.querySelectorAll('.themes-item');
  for (var i = 0; i < rows.length; i++) {
    attachHandlers(rows[i]);
  }

  function attachHandlers(row) {
    row.setAttribute('draggable', 'true');

    row.addEventListener('dragstart', function () {
      dragged = row;
      row.classList.add('themes-dragging');
    });

    row.addEventListener('dragend', function () {
      row.classList.remove('themes-dragging');
      dragged = null;
      submitNewOrder();
    });

    row.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (!dragged || dragged === row) return;

      var rect = row.getBoundingClientRect();
      var after = e.clientY - rect.top > rect.height / 2;
      list.insertBefore(dragged, after ? row.nextSibling : row);
    });
  }
})();
