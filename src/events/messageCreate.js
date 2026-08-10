const stickyManager = require('../features/sticky/stickyManager');
const goosepizzaManager = require('../features/goosepizza/goosepizzaManager');

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message) {
    if (!message.guild) return; // sticky/goosepizza only make sense in guild channels

    await stickyManager.handleNewMessage(message);

    await goosepizzaManager.handleMessage(message).catch((err) => {
      console.error('[goosepizza] Error handling new message:', err);
    });
  },
};
