const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const reactionLimitManager = require('../../../features/reactionlimit/reactionLimitManager');

const EMBED_COLOR = 0xe67e22;

async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channels = await reactionLimitManager.listChannels(interaction.guildId);

  if (channels.length === 0) {
    await interaction.reply({ content: 'No reaction limits are currently configured in this server.', ephemeral: true });
    return;
  }

  const lines = channels.map(
    (c) => `<#${c.channelId}> — max **${reactionLimitManager.REACTION_LIMIT}** per person per thread${c.ignoreFirstPost ? ' (starter message excluded)' : ''}`
  );
  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Reaction limits').setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };
