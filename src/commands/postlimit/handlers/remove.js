const { PermissionFlagsBits } = require('discord.js');
const postLimitManager = require('../../../features/postlimit/postLimitManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const removedCount = await postLimitManager.removeLimit(interaction.guildId, channelId);

  if (removedCount === 0) {
    await interaction.reply({ content: "⚠️ That channel doesn't have a post limit configured.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Post limit removed from <#${channelId}>.`, ephemeral: true });
}

module.exports = { handleRemove };
