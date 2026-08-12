const { PermissionFlagsBits } = require('discord.js');
const autoresponderManager = require('../../../features/autoresponder/autoresponderManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const removedCount = await autoresponderManager.removeChannel(interaction.guildId, channelId);

  if (removedCount === 0) {
    await interaction.reply({ content: "⚠️ That channel doesn't have an autoresponder configured.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Autoresponder removed from <#${channelId}>.`, ephemeral: true });
}

module.exports = { handleRemove };
