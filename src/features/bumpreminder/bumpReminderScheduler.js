const cron = require('node-cron');
const { checkAllDue } = require('./bumpReminderManager');

// Unlike Incident/Birthday (one fixed daily cron) or QOTD/Themes (polls every 8h, fine for
// a schedule measured in days), a bump reminder needs to fire close to exactly 2h after the
// last bump — an 8-hourly poll would routinely show up 5-6 hours late. Polls every minute
// instead; checkAllDue itself decides per-guild whether a reminder is actually due right now.
function start(client) {
  cron.schedule('* * * * *', () => checkAllDue(client));

  console.log('[bumpreminder] Scheduler started.');
}

module.exports = { start };
