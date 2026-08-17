const cron = require('node-cron');
const { checkAllDue } = require('./themesManager');

// Straight copy of qotdScheduler.js's polling approach — each guild picks its own schedule
// (a specific time of day, or every N hours), so instead of one static cron expression this
// polls periodically and lets themesManager.checkAllDue decide per-guild whether a post is
// actually due right now. Kept in sync with QOTD's own poll interval (currently every 8
// hours, deliberately infrequent since the bot only runs on one server for now) — see
// qotdScheduler.js for the tradeoff notes (daily_time can land up to ~8h late, interval
// schedules shorter than 8h effectively run on an 8h cadence).
function start(client) {
  cron.schedule('0 */8 * * *', () => checkAllDue(client));

  console.log('[themes] Scheduler started.');
}

module.exports = { start };
