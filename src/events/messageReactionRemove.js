const starboardManager = require('../features/starboard/starboardManager');
const reactionLimitManager = require('../features/reactionlimit/reactionLimitManager');

module.exports = {
  name: 'messageReactionRemove',
  once: false,
  async execute(reaction, user) {
    if (user.bot) return;

    // Reactions on messages the bot doesn't have cached (e.g. posted before
    // a restart) arrive as partials — fetch the full data before using it.
    if (reaction.partial) {
      reaction = await reaction.fetch().catch(() => null);
      if (!reaction) return;
    }
    if (reaction.message.partial) {
      await reaction.message.fetch().catch(() => null);
    }

    const message = reaction.message;
    if (!message.guild) return;

    await starboardManager.handleReactionChange(reaction, message.guild).catch((err) => {
      console.error('[starboard] Error handling reaction remove:', err);
    });

    await starboardManager.handleStarboardPostReactionChange(reaction, message.guild).catch((err) => {
      console.error('[starboard] Error handling reaction remove on a starboard repost:', err);
    });

    await reactionLimitManager.handleReactionRemove(reaction, user, message.guild).catch((err) => {
      console.error('[reactionlimit] Error handling reaction remove:', err);
    });
  },
};
