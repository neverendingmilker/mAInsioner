const { PermissionFlagsBits } = require('discord.js');
const reactionCodeManager = require('../../../features/reactioncode/reactionCodeManager');

async function handleSetDigit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const digit = interaction.options.getString('digit');
  const emoji = interaction.options.getString('emoji');

  try {
    await reactionCodeManager.setDigit(interaction.guildId, channelId, digit, emoji);
  } catch (err) {
    if (err instanceof reactionCodeManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
      return;
    }
    throw err;
  }

  await interaction.reply({ content: `✅ Digit **${digit}** now maps to ${emoji} in <#${channelId}>.`, ephemeral: true });
}

module.exports = { handleSetDigit };
