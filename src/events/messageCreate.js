const stickyManager = require('../features/sticky/stickyManager');

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message) {
    if (!message.guild) return; // sticky messages only make sense in guild channels

    await stickyManager.handleNewMessage(message);
  },
};
