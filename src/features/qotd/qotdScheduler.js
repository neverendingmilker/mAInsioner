const cron = require('node-cron');
const { checkAllDue } = require('./qotdManager');

// Unlike Birthday/Incident Counter (one fixed daily cron, same time for every guild),
// each guild picks its own schedule (a specific time of day, or every N hours) — so
// instead of one static cron expression, this polls every 8 hours and lets
// qotdManager.checkAllDue decide per-guild whether a post is actually due right now.
// Deliberately infrequent (the bot only runs on one server for now) — the tradeoff is
// a daily_time post can land up to ~8h after its target time, and an interval_hours
// schedule shorter than 8h will effectively fire every 8h instead of on its own cadence.
function start(client) {
  cron.schedule('0 */8 * * *', () => checkAllDue(client));

  console.log('[qotd] Scheduler started.');
}

module.exports = { start };
