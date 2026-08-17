// Vanilla-JS drag-and-drop reordering for the Question of the Day queue, no
// dependencies. Each ".reorder-item" row is draggable; dropping it above/below
// another row moves it there in the DOM, then a hidden form (#qotd-reorder-form) is
// submitted with the new order (comma-separated question IDs) — same "plain HTML form
// POST" convention every other dashboard page uses, just built from JS instead of typed
// by hand.
(function () {
  var list = document.getElementById('qotd-question-list');
  if (!list) return;

  var form = document.getElementById('qotd-reorder-form');
  var orderInput = document.getElementById('qotd-order-input');
  var dragged = null;

  function currentOrder() {
    var rows = list.querySelectorAll('.reorder-item');
    var ids = [];
    for (var i = 0; i < rows.length; i++) ids.push(rows[i].getAttribute('data-id'));
    return ids.join(',');
  }

  function submitNewOrder() {
    orderInput.value = currentOrder();
    form.submit();
  }

  var rows = list.querySelectorAll('.reorder-item');
  for (var i = 0; i < rows.length; i++) {
    attachHandlers(rows[i]);
  }

  function attachHandlers(row) {
    row.setAttribute('draggable', 'true');

    row.addEventListener('dragstart', function () {
      dragged = row;
      row.classList.add('reorder-dragging');
    });

    row.addEventListener('dragend', function () {
      row.classList.remove('reorder-dragging');
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
