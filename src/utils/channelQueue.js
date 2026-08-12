// Discord delivers messageCreate events for a guild in order over a single gateway
// connection, but our own handlers are async and do several awaited DB calls before
// finishing — two messages sent moments apart can have their processing interleave and
// finish in either order, purely based on how much async work each one's path happens
// to do. Chaining tasks onto a per-key queue guarantees they run in the order they were
// enqueued (i.e. the order the events actually arrived), not the order their internal
// awaits happen to resolve.
const queues = new Map();

function runInOrder(key, task) {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  // Keep the stored tail always-settled so one failure doesn't wedge the queue for that
  // key, and so old settled promises don't accumulate in memory forever.
  queues.set(key, next.catch(() => {}));
  return next;
}

module.exports = { runInOrder };
