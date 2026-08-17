// Vanilla-JS resizable divider for a two-column card layout (public/style.css's
// .card-list.two-col + #card-resize-handle) — piloted on Anime Night only for now.
// Dragging the handle updates the live split immediately; only releasing it (mouseup)
// triggers a save (POST to /card-layout/:featureKey/resize, only if the fraction actually
// changed), same "don't save on every intermediate step" principle as cardReorder.js's
// re-lock-to-save flow.
(function () {
  // Same reasoning as cardReorder.js: this script tag can end up anywhere relative to the
  // #card-list markup in the page, so wait for the DOM to actually exist before touching it.
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    var list = document.getElementById('card-list');
    var handle = document.getElementById('card-resize-handle');
    var form = document.getElementById('card-layout-form');
    var fractionInput = document.getElementById('card-layout-fraction-input');
    if (!list || !handle || !form || !fractionInput) return; // Mod session (no handle rendered), or a page without two-col markup at all.

    var dragging = false;
    var changed = false;
    var startX = 0;
    var startFraction = parseFloat(list.dataset.col1Fraction) || 0.5;

    function applyFraction(fraction) {
      var clamped = Math.min(0.8, Math.max(0.2, fraction));
      list.style.setProperty('--col1-fr', clamped + 'fr');
      list.style.setProperty('--col2-fr', (1 - clamped) + 'fr');
      list.dataset.col1Fraction = clamped;
      return clamped;
    }

    handle.addEventListener('mousedown', function (e) {
      dragging = true;
      changed = false;
      startX = e.clientX;
      startFraction = parseFloat(list.dataset.col1Fraction) || 0.5;
      handle.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var rect = list.getBoundingClientRect();
      var deltaFraction = (e.clientX - startX) / rect.width;
      var clamped = applyFraction(startFraction + deltaFraction);
      if (Math.abs(clamped - startFraction) > 0.001) changed = true;
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('resizing');
      document.body.style.cursor = '';
      if (!changed) return; // Just a click, no real drag — nothing to save.
      fractionInput.value = list.dataset.col1Fraction;
      form.submit();
    });
  }
})();
