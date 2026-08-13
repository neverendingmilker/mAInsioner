const { PermissionFlagsBits } = require('discord.js');
const slowModeManager = require('../../../features/slowmode/slowModeManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages) && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Manage Messages" or "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const removedCount = await slowModeManager.removeLimit(interaction.guildId, channelId);

  if (removedCount === 0) {
    await interaction.reply({ content: "⚠️ That channel doesn't have a slowmode configured.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Slowmode removed from <#${channelId}>.`, ephemeral: true });
}

module.exports = { handleRemove };
