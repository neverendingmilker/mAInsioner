const inviteTrackerManager = require('../features/invitetracker/inviteTrackerManager');

module.exports = {
  name: 'inviteCreate',
  once: false,
  execute(invite) {
    inviteTrackerManager.cacheInvite(invite);
  },
};
