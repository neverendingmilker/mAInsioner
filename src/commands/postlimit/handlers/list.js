const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const postLimitManager = require('../../../features/postlimit/postLimitManager');

const EMBED_COLOR = 0x3498db;

async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const limits = await postLimitManager.listLimits(interaction.guildId);

  if (limits.length === 0) {
    await interaction.reply({ content: 'No post limits are currently configured in this server.', ephemeral: true });
    return;
  }

  const lines = limits.map((l) => `<#${l.channelId}> — one message every **${l.cooldownLabel}**`);
  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Post limits').setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };
