const cron = require('node-cron');
const { checkAllDue } = require('./qotdManager');

// Unlike Birthday/Incident Counter (one fixed daily cron, same time for every guild),
// each guild picks its own schedule (a specific time of day, or every N hours) — so
// instead of one static cron expression, this polls every 15 minutes and lets
// qotdManager.checkAllDue decide per-guild whether a post is actually due right now.
// 15 minutes keeps the check cheap (the bot only runs on one server for now) while
// still being granular enough for an HH:mm daily time or an hourly interval without
// meaningfully drifting — worst case a post lands up to ~15 minutes after its target time.
function start(client) {
  cron.schedule('*/15 * * * *', () => checkAllDue(client));

  console.log('[qotd] Scheduler started.');
}

module.exports = { start };
