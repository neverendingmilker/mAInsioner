const { PermissionFlagsBits } = require('discord.js');
const waifuWarLRManager = require('../../../features/waifuwarlr/waifuWarLRManager');

async function handleRemoveDigit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const digit = interaction.options.getString('digit');
  const removedCount = await waifuWarLRManager.removeDigit(interaction.guildId, channelId, digit);

  if (removedCount === 0) {
    await interaction.reply({ content: `⚠️ Digit **${digit}** isn't mapped to anything in <#${channelId}>.`, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Digit **${digit}**'s mapping removed from <#${channelId}>.`, ephemeral: true });
}

module.exports = { handleRemoveDigit };
