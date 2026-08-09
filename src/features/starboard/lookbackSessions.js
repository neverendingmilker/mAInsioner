// Holds the options for a /starboard lookback command between the initial reply (which
// shows a channel picker) and the follow-up interaction (channel select or "run now"
// button) that actually kicks off the scan. In-memory only — this is short-lived UI
// state, not something that needs to survive a restart.

const sessions = new Map();
const TTL_MS = 10 * 60 * 1000; // picker is only useful for a few minutes anyway

function create(messageId, options) {
  sessions.set(messageId, options);
  const timer = setTimeout(() => sessions.delete(messageId), TTL_MS);
  timer.unref?.(); // don't keep the process alive just for this cleanup
}

// Reads and removes the session in one step — a picker is single-use.
function consume(messageId) {
  const options = sessions.get(messageId);
  sessions.delete(messageId);
  return options ?? null;
}

module.exports = { create, consume };
