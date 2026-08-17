const birthdayScheduler = require('../features/birthday/birthdayScheduler');
const { warmMemberCache } = require('../features/comboroles/memberCacheWarmer');
const stickyManager = require('../features/sticky/stickyManager');
const incidentScheduler = require('../features/incident/incidentScheduler');
const inviteTrackerManager = require('../features/invitetracker/inviteTrackerManager');
const qotdScheduler = require('../features/qotd/qotdScheduler');
const themesScheduler = require('../features/themes/themesScheduler');

module.exports = {
  name: 'clientReady', // renamed from 'ready': in discord.js v15 this will be the only name available
  once: true,
  execute(client) {
    console.log(`✅ Bot online as ${client.user.tag}`);

    // Every feature that needs periodic jobs or a one-off startup task
    // registers itself here. When adding new features in the future, just
    // add a line here.
    birthdayScheduler.start(client);
    warmMemberCache(client).catch((err) => console.error('[comboroles] Error warming member cache:', err));
    stickyManager
      .loadAll()
      .then((count) => console.log(`[sticky] Loaded ${count} sticky message(s).`))
      .catch((err) => console.error('[sticky] Error loading sticky messages:', err));
    incidentScheduler.start(client);
    qotdScheduler.start(client);
    themesScheduler.start(client);

    for (const guild of client.guilds.cache.values()) {
      inviteTrackerManager.warmInviteCache(guild).catch((err) => {
        console.error(`[invitetracker] Could not warm invite cache for guild "${guild.name}":`, err.message);
      });
    }
  },
};
