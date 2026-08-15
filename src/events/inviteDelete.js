const inviteTrackerManager = require('../features/invitetracker/inviteTrackerManager');

module.exports = {
  name: 'inviteDelete',
  once: false,
  execute(invite) {
    inviteTrackerManager.forgetInvite(invite.guild?.id, invite.code);
  },
};
