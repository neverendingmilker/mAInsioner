const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const autoresponderManager = require('../../../features/autoresponder/autoresponderManager');

const EMBED_COLOR = 0x9b59b6;

function describeFilter(contentFilter) {
  const tags = [];
  if (contentFilter.attachment) tags.push('attachment');
  if (contentFilter.videoLink) tags.push('video link');
  if (contentFilter.xLink) tags.push('X/Twitter link');
  return tags.length > 0 ? ` (only: ${tags.join(', ')})` : '';
}

function describePairMode(pairWithinSeconds) {
  return pairWithinSeconds ? ` · pair mode: 2nd of pair within ${pairWithinSeconds}s` : '';
}

async function handleList(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need the "Administrator" permission to use this command.', ephemeral: true });
    return;
  }

  const channels = await autoresponderManager.listChannels(interaction.guildId);

  if (channels.length === 0) {
    await interaction.reply({ content: 'No autoresponders are currently configured in this server.', ephemeral: true });
    return;
  }

  const lines = channels.map(
    (c) => `<#${c.channelId}> — ${c.emojis.join(' ')}${describeFilter(c.contentFilter)}${describePairMode(c.pairWithinSeconds)}`
  );
  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Autoresponders').setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handleList };
