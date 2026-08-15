const inviteTrackerManager = require('../features/invitetracker/inviteTrackerManager');

module.exports = {
  name: 'guildMemberRemove',
  once: false,
  async execute(member) {
    await inviteTrackerManager.handleMemberRemove(member).catch((err) => {
      console.error('[invitetracker] Error handling member remove:', err);
    });
  },
};
