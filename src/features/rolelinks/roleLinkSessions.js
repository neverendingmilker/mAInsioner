// Holds the pending role1/viceversa choice for /rolelink add between the initial reply
// (which shows a role picker for the target role(s)) and the follow-up role-select
// interaction that actually creates the link(s). In-memory only.

const sessions = new Map();
const TTL_MS = 10 * 60 * 1000;

function create(messageId, session) {
  sessions.set(messageId, session);
  const timer = setTimeout(() => sessions.delete(messageId), TTL_MS);
  timer.unref?.();
}

function consume(messageId) {
  const session = sessions.get(messageId);
  sessions.delete(messageId);
  return session ?? null;
}

module.exports = { create, consume };
