const { PermissionFlagsBits } = require('discord.js');
const reactionLimitManager = require('../../../features/reactionlimit/reactionLimitManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const removedCount = await reactionLimitManager.removeChannel(interaction.guildId, channelId);

  if (removedCount === 0) {
    await interaction.reply({ content: "⚠️ That channel doesn't have a reaction limit configured.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Reaction limit removed from <#${channelId}>.`, ephemeral: true });
}

module.exports = { handleRemove };
