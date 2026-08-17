// Every "Modifica" (✎) popover across the dashboard is a plain <details>/<summary> — no JS
// needed to open/close one on its own, the browser already does that. What it doesn't do on
// its own: close OTHER open ones when you open a new one, so clicking a second edit button
// while a first popover is still open used to leave both open at once, stacked on top of
// whatever was underneath. This makes every <details> on every page mutually exclusive.
//
// Loaded once from partials/footer.ejs, so it applies dashboard-wide without needing to
// touch each individual view.
(function () {
  'use strict';

  // The native `toggle` event doesn't bubble, so listening in the CAPTURE phase on
  // `document` is what lets one listener catch it from any <details> on the page, including
  // ones that didn't exist yet when this script ran (e.g. a card added after an AJAX-free
  // form submit reloads part of the page — not currently a thing here, but harmless either
  // way since capture-phase delegation doesn't care when the element was added).
  document.addEventListener(
    'toggle',
    function (e) {
      var opened = e.target;
      if (!(opened instanceof HTMLDetailsElement) || !opened.open) return;

      var allDetails = document.querySelectorAll('details[open]');
      for (var i = 0; i < allDetails.length; i++) {
        if (allDetails[i] !== opened) allDetails[i].open = false;
      }
    },
    true
  );
})();
