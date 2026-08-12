const stickyManager = require('../features/sticky/stickyManager');
const goosepizzaManager = require('../features/goosepizza/goosepizzaManager');
const postLimitManager = require('../features/postlimit/postLimitManager');

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message) {
    if (!message.guild) return; // sticky/goosepizza/postlimit only make sense in guild channels

    const wasBlocked = await postLimitManager.checkAndEnforce(message).catch((err) => {
      console.error('[postlimit] Error handling new message:', err);
      return false;
    });
    if (wasBlocked) return; // message was deleted for exceeding the post limit — nothing else should react to it

    await stickyManager.handleNewMessage(message);

    await goosepizzaManager.handleMessage(message).catch((err) => {
      console.error('[goosepizza] Error handling new message:', err);
    });
  },
};
