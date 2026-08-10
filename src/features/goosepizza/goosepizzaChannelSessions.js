// Holds pending state for a /goosepizza create or /goosepizza channels command between
// the initial reply (which shows a channel picker) and the follow-up channel-select
// interaction that actually commits the change. In-memory only — short-lived UI state,
// not something that needs to survive a restart.

const sessions = new Map();
const TTL_MS = 10 * 60 * 1000; // picker is only useful for a few minutes anyway

function create(messageId, session) {
  sessions.set(messageId, session);
  const timer = setTimeout(() => sessions.delete(messageId), TTL_MS);
  timer.unref?.(); // don't keep the process alive just for this cleanup
}

// Reads and removes the session in one step — a picker is single-use.
function consume(messageId) {
  const session = sessions.get(messageId);
  sessions.delete(messageId);
  return session ?? null;
}

module.exports = { create, consume };
