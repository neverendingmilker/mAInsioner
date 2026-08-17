// Vanilla-JS drag-and-drop reordering for the Question of the Day queue, no
// dependencies. Each ".reorder-item" row is draggable; dropping it above/below
// another row moves it there in the DOM, then a hidden form (#qotd-reorder-form) is
// submitted with the new order (comma-separated question IDs) — same "plain HTML form
// POST" convention every other dashboard page uses, just built from JS instead of typed
// by hand. Same shape/style as cardReorder.js ('use strict', a CONFIG object, rAF-throttled
// drag handling) — see themesReorder.js for the (near-identical) Themes copy of this file.
(function () {
  'use strict';

  var CONFIG = {
    listId: 'qotd-question-list',
    formId: 'qotd-reorder-form',
    orderInputId: 'qotd-order-input',
    itemSelector: '.reorder-item',
    draggingClass: 'reorder-dragging',
  };

  var list = document.getElementById(CONFIG.listId);
  if (!list) return;

  var form = document.getElementById(CONFIG.formId);
  var orderInput = document.getElementById(CONFIG.orderInputId);
  var dragged = null;

  // Collapses any number of dragover calls within the same animation frame into exactly
  // one, running with the arguments from the *last* call — dragover fires far faster than
  // the browser paints, same reasoning as cardReorder.js's own rafThrottle.
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

  function currentOrder() {
    var rows = list.querySelectorAll(CONFIG.itemSelector);
    var ids = [];
    for (var i = 0; i < rows.length; i++) ids.push(rows[i].getAttribute('data-id'));
    return ids.join(',');
  }

  function submitNewOrder() {
    orderInput.value = currentOrder();
    form.submit();
  }

  var handleDragOver = rafThrottle(function (row, clientY) {
    if (!dragged || dragged === row) return;

    var rect = row.getBoundingClientRect();
    var after = clientY - rect.top > rect.height / 2;
    list.insertBefore(dragged, after ? row.nextSibling : row);
  });

  function attachHandlers(row) {
    row.setAttribute('draggable', 'true');

    row.addEventListener('dragstart', function () {
      dragged = row;
      row.classList.add(CONFIG.draggingClass);
    });

    row.addEventListener('dragend', function () {
      row.classList.remove(CONFIG.draggingClass);
      dragged = null;
      submitNewOrder();
    });

    row.addEventListener('dragover', function (e) {
      e.preventDefault();
      handleDragOver(row, e.clientY);
    });
  }

  var rows = list.querySelectorAll(CONFIG.itemSelector);
  for (var i = 0; i < rows.length; i++) {
    attachHandlers(rows[i]);
  }
})();
