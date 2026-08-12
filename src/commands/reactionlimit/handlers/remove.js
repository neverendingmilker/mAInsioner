const { PermissionFlagsBits } = require('discord.js');
const reactionLimitManager = require('../../../features/reactionlimit/reactionLimitManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel');
  const removedCount = await reactionLimitManager.removeChannel(interaction.guildId, channel.id);

  if (removedCount === 0) {
    await interaction.reply({ content: `⚠️ ${channel} doesn't have a reaction limit configured.`, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Reaction limit removed from ${channel}.`, ephemeral: true });
}

module.exports = { handleRemove };
