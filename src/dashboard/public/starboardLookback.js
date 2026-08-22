// Live-updates the ".lookback-status" badge on each starboard card while a lookback
// scan it started is still running, by polling GET /starboard/lookback/status. No
// dependencies. Only polls while at least one badge on the page is actually "running" —
// most page loads have none, so this is a no-op most of the time.
(function () {
  'use strict';

  var POLL_INTERVAL_MS = 2500;
  var timer = null;

  function badges() {
    return Array.prototype.slice.call(document.querySelectorAll('.lookback-status[data-board-name]'));
  }

  function anyRunning() {
    return badges().some(function (el) {
      return el.getAttribute('data-status') === 'running';
    });
  }

  function renderText(badge, stats) {
    var textEl = badge.querySelector('.lookback-status-text');
    if (!textEl) return;

    if (stats.status === 'running') {
      textEl.textContent =
        '🔍 Scan in progress… ' + stats.scanned + ' messages checked, ' + stats.qualified + ' added so far (' + stats.channelsScanned + ' channels).';
    } else if (stats.status === 'done') {
      var errNote = stats.errors > 0 ? ' (' + stats.errors + ' with errors)' : '';
      textEl.textContent = '✅ Scan complete: ' + stats.scanned + ' messages checked, ' + stats.qualified + ' added to the starboard' + errNote + '.';
    } else if (stats.status === 'error') {
      textEl.textContent = '⚠️ Scan interrupted: ' + (stats.errorMessage || 'unknown error');
    }
  }

  function poll() {
    fetch('/starboard/lookback/status', { credentials: 'same-origin' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data) return;
        badges().forEach(function (badge) {
          var name = badge.getAttribute('data-board-name');
          var stats = data[name];
          if (!stats) return; // already cleaned up server-side, or nothing ever ran

          badge.hidden = false;
          badge.setAttribute('data-status', stats.status);
          renderText(badge, stats);
        });
        scheduleNext();
      })
      .catch(function () {
        // Transient network hiccup — try again on the usual schedule rather than giving
        // up the polling loop entirely.
        scheduleNext();
      });
  }

  function scheduleNext() {
    clearTimeout(timer);
    if (anyRunning()) {
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
  }

  if (anyRunning()) {
    scheduleNext();
  }
})();
