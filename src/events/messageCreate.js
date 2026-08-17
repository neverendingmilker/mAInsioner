const stickyManager = require('../features/sticky/stickyManager');
const goosepizzaManager = require('../features/goosepizza/goosepizzaManager');
const slowModeManager = require('../features/slowmode/slowModeManager');
const autoresponderManager = require('../features/autoresponder/autoresponderManager');
const waifuWarLRManager = require('../features/waifuwarlr/waifuWarLRManager');
const highlightManager = require('../features/highlight/highlightManager');
const honeypotManager = require('../features/honeypot/honeypotManager');
const bumpReminderManager = require('../features/bumpreminder/bumpReminderManager');
const { runInOrder } = require('../utils/channelQueue');

async function processMessage(message) {
  await honeypotManager.handleMessage(message).catch((err) => {
    console.error('[honeypot] Error handling new message:', err);
  });

  // Disboard's own bot message (a bump confirmation), not something any of the other
  // handlers below care about — checked early and independently of them, same "one
  // handler's failure doesn't block the rest" pattern as everything else here.
  await bumpReminderManager.handleMessage(message).catch((err) => {
    console.error('[bumpreminder] Error handling new message:', err);
  });

  const wasBlocked = await slowModeManager.checkAndEnforce(message).catch((err) => {
    console.error('[slowmode] Error handling new message:', err);
    return false;
  });
  if (wasBlocked) return; // message was deleted for exceeding the post limit — nothing else should react to it

  await stickyManager.handleNewMessage(message);

  await goosepizzaManager.handleMessage(message).catch((err) => {
    console.error('[goosepizza] Error handling new message:', err);
  });

  await autoresponderManager.handleMessage(message).catch((err) => {
    console.error('[autoresponder] Error handling new message:', err);
  });

  await waifuWarLRManager.handleMessage(message).catch((err) => {
    console.error('[waifuwarlr] Error handling new message:', err);
  });

  await highlightManager.handleMessage(message).catch((err) => {
    console.error('[highlight] Error handling new message:', err);
  });
}

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message) {
    if (!message.guild) return; // sticky/goosepizza/slowmode/autoresponder/waifuwarlr/highlight/honeypot/bumpreminder only make sense in guild channels

    // Serialized per channel: without this, two messages sent moments apart in the same
    // channel could have their processing interleave and finish out of order (e.g. a
    // fast-replying bot's message reaching autoresponder's redirect check before the
    // human message that was supposed to start the wait for it even got there).
    await runInOrder(message.channelId, () => processMessage(message));
  },
};
