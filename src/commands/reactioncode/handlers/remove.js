const { PermissionFlagsBits } = require('discord.js');
const reactionCodeManager = require('../../../features/reactioncode/reactionCodeManager');

async function handleRemove(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel');
  const removedCount = await reactionCodeManager.removeChannel(interaction.guildId, channelId);

  if (removedCount === 0) {
    await interaction.reply({ content: "⚠️ That channel isn't set up for reaction codes.", ephemeral: true });
    return;
  }

  await interaction.reply({ content: `✅ Reaction codes removed from <#${channelId}> (including its digit mappings).`, ephemeral: true });
}

module.exports = { handleRemove };
