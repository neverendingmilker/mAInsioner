const inviteTrackerManager = require('../features/invitetracker/inviteTrackerManager');

module.exports = {
  name: 'inviteDelete',
  once: false,
  async execute(invite) {
    await inviteTrackerManager.forgetInvite(invite.guild?.id, invite.code).catch((err) => {
      console.error('[invitetracker] Error handling invite delete:', err);
    });
  },
};
