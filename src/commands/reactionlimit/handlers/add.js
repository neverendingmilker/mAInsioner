const { PermissionFlagsBits } = require('discord.js');
const reactionLimitManager = require('../../../features/reactionlimit/reactionLimitManager');

async function handleAdd(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const ignoreFirstPost = interaction.options.getBoolean('ignore_first_post') ?? false;

  try {
    await reactionLimitManager.setChannel(interaction.guild, channel, ignoreFirstPost, interaction.user.id);
  } catch (err) {
    if (err instanceof reactionLimitManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({
    content:
      `✅ In ${channel}'s threads, each person can now react at most **${reactionLimitManager.REACTION_LIMIT}** times per thread` +
      `${ignoreFirstPost ? ' (reactions on the thread\'s starter message don\'t count).' : '.'}`,
    ephemeral: true,
  });
}

module.exports = { handleAdd };
