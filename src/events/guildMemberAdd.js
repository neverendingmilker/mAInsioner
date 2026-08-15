const inviteTrackerManager = require('../features/invitetracker/inviteTrackerManager');

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  async execute(member) {
    await inviteTrackerManager.handleMemberAdd(member).catch((err) => {
      console.error('[invitetracker] Error handling member add:', err);
    });
  },
};
