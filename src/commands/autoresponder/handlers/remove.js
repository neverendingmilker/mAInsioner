const { PermissionFlagsBits } = require('discord.js');
const autoresponderManager = require('../../../features/autoresponder/autoresponderManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const removedCount = await autoresponderManager.removeChannel(interaction.guildId, channel.id);

  if (removedCount === 0) {
    await interaction.reply({ content: `⚠️ ${channel} doesn't have an autoresponder configured.`, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Autoresponder removed from ${channel}.`, ephemeral: true });
}

module.exports = { handleRemove };
